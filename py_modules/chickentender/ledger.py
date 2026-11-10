"""The install ledger: one record per game ChickenTender has put, or is putting, on this device.

The ledger decides a game's state; the disk is only ever checked against it. A record holds the files RomM listed
for the game and their sizes, so "installed" means every one of them is there at its full size, and a download that
was cut off (a restart, a crash, a full disk) is still known afterwards.

    queued       waiting for its turn
    downloading  being fetched now
    paused       held in the queue by the user; stays paused across restarts
    incomplete   stopped with files missing; needs Resume or Remove
    failed       stopped by an error (kept in `error`); Resume tries again
    installed    every file present

Every change is written to disk before it is reported, as a whole file swapped into place.
"""
import json
import logging
import os
import tempfile
import time
from dataclasses import asdict, dataclass, field, fields

VERSION = 1
QUEUED, DOWNLOADING, PAUSED, INCOMPLETE, FAILED, INSTALLED = "queued", "downloading", "paused", "incomplete", "failed", "installed"
STATES = (QUEUED, DOWNLOADING, PAUSED, INCOMPLETE, FAILED, INSTALLED)
# In the download queue; these come back after a restart.
IN_QUEUE = (QUEUED, DOWNLOADING, PAUSED)


@dataclass
class Install:
    rom_id: int
    name: str
    slug: str          # with fs_name and single_file: where the game lives, without asking RomM
    fs_name: str
    single_file: bool
    size_bytes: int = 0
    state: str = QUEUED
    # What RomM listed: [{"path": relative to the game's folder ("" for a single-file game), "size": bytes}].
    # Empty until RomM has answered once.
    files: list[dict] = field(default_factory=list)
    error: str = ""
    queued_at: float = 0
    updated_at: float = 0
    completed_at: float = 0

    @classmethod
    def from_dict(cls, d: dict) -> "Install":
        known = {f.name for f in fields(cls)}
        install = cls(**{k: v for k, v in d.items() if k in known})
        if install.state not in STATES:
            raise ValueError(f"unknown state {install.state!r}")
        install.files = [{"path": str(f["path"]), "size": int(f["size"])} for f in install.files]
        return install


@dataclass(frozen=True)
class Check:
    """A record held against the disk."""
    done_bytes: int
    total_bytes: int
    missing: tuple[str, ...]   # listed files that are absent or not their full size
    known: bool                # False while RomM has not listed the files yet

    @property
    def complete(self) -> bool:
        return self.known and not self.missing


def file_path(install: Install, target_path: str, entry: dict) -> str:
    return os.path.join(target_path, entry["path"]) if entry["path"] else target_path


def check(install: Install, target_path: str) -> Check:
    """Which of the record's files are on disk in full; a `.part` counts towards the bytes done, not as present."""
    done, missing = 0, []
    for entry in install.files:
        path, size = file_path(install, target_path, entry), entry["size"]
        try:
            if os.path.getsize(path) == size and os.path.isfile(path):
                done += size
                continue
        except OSError:
            pass
        missing.append(entry["path"] or os.path.basename(target_path))
        try:
            done += min(os.path.getsize(path + ".part"), size)
        except OSError:
            pass
    total = sum(e["size"] for e in install.files) or install.size_bytes
    return Check(done, total, tuple(missing), bool(install.files))


class Ledger:
    """`path` None keeps the ledger in memory only (tests)."""

    def __init__(self, path: str | None = None, log: logging.Logger | None = None):
        self.path = path
        self.log = log or logging.getLogger(__name__)
        self._installs: dict[int, Install] = {}
        self._load()

    def _load(self) -> None:
        if not self.path or not os.path.exists(self.path):
            return
        try:
            with open(self.path, encoding="utf-8") as f:
                data = json.load(f)
            self._installs = {i.rom_id: i for i in map(Install.from_dict, data["installs"])}
        except (OSError, ValueError, KeyError, TypeError) as e:
            # Kept for a look, never read again; the games on disk are found and checked anew.
            aside = f"{self.path}.unreadable"
            self.log.error("install ledger unreadable (%s); kept as %s and started empty", e, aside)
            try:
                os.replace(self.path, aside)
            except OSError:
                pass
            self._installs = {}

    def _save(self) -> None:
        if not self.path:
            return
        folder = os.path.dirname(self.path)
        os.makedirs(folder, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=folder, prefix=".installs-")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump({"version": VERSION, "installs": [asdict(i) for i in self._installs.values()]}, f, indent=1)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, self.path)
        except BaseException:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise

    def get(self, rom_id: int) -> Install | None:
        return self._installs.get(int(rom_id))

    def all(self) -> list[Install]:
        return list(self._installs.values())

    def put(self, install: Install) -> Install:
        """Adds a record, or replaces the one for the same game."""
        old = self._installs.get(install.rom_id)
        now = time.time()
        install.queued_at = install.queued_at or (old.queued_at if old else 0) or now
        install.updated_at = now
        self._installs[install.rom_id] = install
        self._save()
        self.log.info("install %s (%s): %s -> %s", install.rom_id, install.name, old.state if old else "none", install.state)
        return install

    def update(self, rom_id: int, **changes) -> Install | None:
        """Changes fields of a record (`state=`, `files=`, `error=` ...); None when the game has no record."""
        install = self._installs.get(int(rom_id))
        if not install:
            return None
        before = install.state
        for key, value in changes.items():
            if key not in Install.__dataclass_fields__:
                raise AttributeError(key)
            setattr(install, key, value)
        if install.state not in STATES:
            install.state = before
            raise ValueError(f"unknown state {changes.get('state')!r}")
        if install.state != FAILED and "error" not in changes:
            install.error = ""
        install.updated_at = time.time()
        if install.state == INSTALLED and before != INSTALLED:
            install.completed_at = install.updated_at
        self._save()
        if install.state != before:
            self.log.info("install %s (%s): %s -> %s%s", install.rom_id, install.name, before, install.state,
                          f" ({install.error})" if install.error else "")
        return install

    def remove(self, rom_id: int) -> Install | None:
        install = self._installs.pop(int(rom_id), None)
        if install:
            self._save()
            self.log.info("install %s (%s): %s -> removed", install.rom_id, install.name, install.state)
        return install
