"""Downloads, one at a time, straight into the game's target: every file streams to `<name>.part` and resumes from it.

Jobs keep the order they were queued in; pause keeps a job's place, cancel drops it. Finished jobs stay listed
(like Steam's "Completed" rows) until `clear()`. Every change of a job's state goes to the install ledger first,
and `restore()` rebuilds the queue from it after a restart.
"""
import asyncio
import os
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

from . import ledger as L
from .install import InstallLocation, Target
from .ledger import Install, Ledger
from .library import Game
from .romm import RommClient, RommError

CHUNK = 1 << 18
PROGRESS_EVERY_S = 0.5
GAME_FILE_CATEGORIES = (None, "game")
ACTIVE = ("queued", "downloading", "paused")


@dataclass
class Job:
    game: Game
    appid: int = 0
    done_bytes: int = 0
    total_bytes: int = 0
    bps: float = 0
    status: str = "queued"  # queued | downloading | paused | done | failed | cancelled
    error: str = ""
    started_at: float = 0
    completed_at: float = 0
    task: asyncio.Task | None = None
    _rate_from: tuple[float, int] = field(default=(0.0, 0))

    def progress(self) -> dict:
        return {"rom_id": self.game.rom_id, "appid": self.appid, "done_bytes": self.done_bytes, "total_bytes": self.total_bytes,
                "bps": self.bps, "status": self.status, "error": self.error}

    def view(self, queue_index: int) -> dict:
        """The shape Steam's Downloads page bridge renders (see src/steam/inject.ts OurDownload)."""
        active = self.status == "downloading"
        remaining = self.total_bytes - self.done_bytes
        return {
            "appid": self.appid, "rom_id": self.game.rom_id, "name": self.game.name,
            "bytes_total": self.total_bytes or self.game.size_bytes, "bytes_done": self.done_bytes,
            "rate": self.bps if active else 0,
            "eta": int(remaining / self.bps) if active and self.bps > 0 else -1,
            "state": "done" if self.status == "done" else "paused" if self.status == "paused" else "downloading" if active else "queued",
            "queue_index": queue_index, "completed_at": int(self.completed_at), "started_at": int(self.started_at),
        }


def game_files(rom: dict) -> list[dict]:
    return [f for f in rom.get("files", []) if f.get("category") in GAME_FILE_CATEGORIES]


def manifest(rom: dict, target: Target) -> list[dict]:
    """The ledger's file list for a game: each of RomM's game files as a path inside the target and its size."""
    prefix = f"{rom.get('fs_path', '')}/{rom['fs_name']}".strip("/")
    out = []
    for f in game_files(rom):
        path = ""
        if target.is_dir:
            rel = f.get("file_path", "").strip("/")
            rel = rel[len(prefix):].strip("/") if rel.startswith(prefix) else ""
            path = os.path.join(rel, f["file_name"])
        out.append({"path": path, "size": int(f.get("file_size_bytes", 0))})
    return out


def as_game(install: Install) -> Game:
    """Enough of a game to download it before the library has loaded."""
    return Game(rom_id=install.rom_id, name=install.name, platform_id=0, platform="", slug=install.slug,
                fs_name=install.fs_name, single_file=install.single_file, size_bytes=install.size_bytes, cover="")


class Downloader:
    def __init__(self, client: RommClient, location: InstallLocation,
                 on_progress: Callable[[dict], None], on_finished: Callable[[Job], Awaitable[None]],
                 ledger: Ledger | None = None):
        self.ledger = ledger or Ledger()
        self.client = client
        self.location = location
        self.on_progress = on_progress
        self.on_finished = on_finished
        self.jobs: dict[int, Job] = {}
        self.order: list[int] = []
        self._runner: asyncio.Task | None = None
        self._stopping = False
        self._wake = asyncio.Event()

    # Queries
    def snapshot(self) -> dict:
        active = next((j.progress() for j in self.jobs.values() if j.status == "downloading"), None)
        live = [i for i in self.order if self.jobs[i].status in ACTIVE]
        items = [self.jobs[i].view(idx) for idx, i in enumerate(live)]
        items += [j.view(-1) for j in self.jobs.values() if j.status == "done"]
        return {"active": active, "queue": [i for i in live if self.jobs[i].status != "downloading"],
                "items": items, "roms_dir": self.location.roms_dir}

    # Commands
    def _target(self, game: Game) -> Target:
        return self.location.target(game.slug, game.fs_name, game.single_file)

    def restore(self, appid_of: Callable[[int], int] = lambda rom_id: 0) -> None:
        """Puts the ledger's unfinished downloads back in the queue, oldest first; paused ones stay paused."""
        for install in sorted(self.ledger.all(), key=lambda i: i.queued_at):
            if install.state not in L.IN_QUEUE or install.rom_id in self.jobs:
                continue
            game = as_game(install)
            seen = L.check(install, self._target(game).path)
            self.jobs[install.rom_id] = Job(game, appid=appid_of(install.rom_id), done_bytes=seen.done_bytes, total_bytes=seen.total_bytes,
                                            status="paused" if install.state == L.PAUSED else "queued")
            self.order.append(install.rom_id)
            if install.state == L.DOWNLOADING:
                self.ledger.update(install.rom_id, state=L.QUEUED)
        if self.order:
            self._kick()

    def add(self, game: Game, appid: int = 0) -> None:
        """Queues a game; one that is paused starts again."""
        job = self.jobs.get(game.rom_id)
        if job and job.status in ACTIVE:
            if appid and not job.appid:
                job.appid = appid
            if job.status == "paused":
                job.status = "queued"
                self.ledger.update(game.rom_id, state=L.QUEUED)
                self._kick()
            return
        old = self.ledger.get(game.rom_id)
        self.ledger.put(Install(rom_id=game.rom_id, name=game.name, slug=game.slug, fs_name=game.fs_name, single_file=game.single_file,
                                size_bytes=game.size_bytes, state=L.QUEUED, files=old.files if old else []))
        seen = L.check(self.ledger.get(game.rom_id), self._target(game).path)
        self.jobs[game.rom_id] = Job(game, appid=appid, done_bytes=seen.done_bytes, total_bytes=seen.total_bytes)
        if game.rom_id in self.order:
            self.order.remove(game.rom_id)
        self.order.append(game.rom_id)
        self._kick()

    def add_appid(self, rom_id: int, appid: int) -> None:
        job = self.jobs.get(rom_id)
        if job:
            job.appid = appid

    async def cancel(self, rom_id: int) -> None:
        job = self.jobs.get(rom_id)
        if not job or job.status not in ACTIVE:
            return
        if job.status == "downloading" and job.task:
            job.task.cancel()
            return  # the runner reports it
        job.status = "cancelled"
        self.order.remove(rom_id)
        self.ledger.update(rom_id, state=L.INCOMPLETE)
        await self.on_finished(job)

    async def pause(self, rom_id: int) -> None:
        job = self.jobs.get(rom_id)
        if not job or job.status not in ("queued", "downloading"):
            return
        job.status = "paused"
        self.ledger.update(rom_id, state=L.PAUSED)
        if job.task:
            job.task.cancel()  # the runner sees "paused" and keeps the job
        else:
            await self.on_finished(job)

    async def resume(self, rom_id: int) -> None:
        job = self.jobs.get(rom_id)
        if not job or job.status != "paused":
            return
        job.status = "queued"
        self.ledger.update(rom_id, state=L.QUEUED)
        self._kick()
        await self.on_finished(job)

    async def pause_all(self) -> None:
        for i in list(self.order):
            await self.pause(i)

    async def resume_all(self) -> None:
        for i in list(self.order):
            await self.resume(i)

    def move(self, rom_id: int, delta: int) -> None:
        pending = [i for i in self.order if self.jobs[i].status in ("queued", "paused")]
        if rom_id not in pending:
            return
        pending.remove(rom_id)
        pos = max(0, min(len(pending), pending.index(rom_id) + delta if rom_id in pending else 0))
        self.move_to(rom_id, pos)

    def move_to(self, rom_id: int, index: int) -> None:
        pending = [i for i in self.order if self.jobs[i].status in ("queued", "paused")]
        if rom_id not in pending:
            return
        pending.remove(rom_id)
        pending.insert(max(0, min(len(pending), index)), rom_id)
        rest = [i for i in self.order if self.jobs[i].status not in ("queued", "paused")]
        self.order = rest + pending

    async def drop(self, rom_id: int) -> None:
        """Takes a game out for good (it is being removed), once a running download has let go of its files."""
        job = self.jobs.pop(rom_id, None)
        if rom_id in self.order:
            self.order.remove(rom_id)
        if job and job.task and not job.task.done():
            job.status = "cancelled"
            job.task.cancel()
            await asyncio.wait([job.task])

    def clear(self) -> None:
        for rom_id in [i for i, j in self.jobs.items() if j.status not in ACTIVE]:
            del self.jobs[rom_id]
            if rom_id in self.order:
                self.order.remove(rom_id)

    async def stop(self) -> None:
        """Shutting down: the ledger keeps every job as it is, so `restore()` continues them."""
        self._stopping = True
        if self._runner and not self._runner.done():
            self._runner.cancel()
        for job in self.jobs.values():
            if job.task and not job.task.done():
                job.task.cancel()

    # The runner
    def _kick(self) -> None:
        self._wake.set()
        if not self._runner or self._runner.done():
            self._runner = asyncio.create_task(self._run())

    async def _run(self) -> None:
        while True:
            self._wake.clear()
            rom_id = next((i for i in self.order if self.jobs[i].status == "queued"), None)
            if rom_id is None:
                if any(self.jobs[i].status == "paused" for i in self.order):
                    await self._wake.wait()  # a resume will wake us
                    continue
                return
            job = self.jobs[rom_id]
            job.status = "downloading"
            job.started_at = job.started_at or time.time()
            self.ledger.update(rom_id, state=L.DOWNLOADING)
            job.task = asyncio.create_task(self._download(job))
            try:
                await job.task
                seen = L.check(self.ledger.get(rom_id), self._target(job.game).path)
                if not seen.complete:
                    raise RuntimeError(f"{len(seen.missing)} file(s) missing after the download: {', '.join(seen.missing[:3])}")
                job.status = "done"
                job.completed_at = time.time()
            except asyncio.CancelledError:
                if self._stopping:
                    raise
                if job.status != "paused":
                    job.status = "cancelled"
            except RommError as e:
                job.status, job.error = "failed", f"RomM answered {e.status}"
            except Exception as e:
                job.status, job.error = "failed", str(e) or type(e).__name__
            job.task = None
            job.bps = 0
            if job.status == "done":
                self.ledger.update(rom_id, state=L.INSTALLED)
            elif job.status == "failed":
                self.ledger.update(rom_id, state=L.FAILED, error=job.error)
            elif job.status == "cancelled":
                self.ledger.update(rom_id, state=L.INCOMPLETE)
            if job.status not in ACTIVE and rom_id in self.order and job.status != "done":
                self.order.remove(rom_id)
            self.on_progress(job.progress())
            await self.on_finished(job)

    async def _download(self, job: Job) -> None:
        rom = await self.client.rom(job.game.rom_id)
        files = game_files(rom)
        if not files:
            raise RuntimeError("RomM lists no game files for this title")
        target = self._target(job.game)
        listed = manifest(rom, target)
        job.total_bytes = sum(e["size"] for e in listed)
        install = self.ledger.update(job.game.rom_id, files=listed, size_bytes=job.total_bytes)
        completed = 0
        for f, entry in zip(files, listed):
            dest = L.file_path(install, target.path, entry)
            if os.path.isfile(dest) and os.path.getsize(dest) == entry["size"]:
                completed += entry["size"]
                job.done_bytes = completed
                continue
            await self._fetch(job, f, dest, completed)
            completed += entry["size"]

    async def _fetch(self, job: Job, f: dict, dest: str, completed: int) -> None:
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        part = dest + ".part"
        start = os.path.getsize(part) if os.path.isfile(part) else 0
        if start > f.get("file_size_bytes", start):
            # Not a piece of this file (RomM's copy changed, or the .part is damaged): start over.
            os.unlink(part)
            start = 0
        async with self.client.content(job.game.rom_id, f["id"], f["file_name"], start) as r:
            if r.status == 416:  # the .part is already complete
                os.replace(part, dest)
                return
            if r.status >= 400:
                raise RommError(r.status, (await r.text())[:200])
            resumed = r.status == 206
            job.done_bytes = completed + (start if resumed else 0)
            last = time.monotonic()
            job._rate_from = (last, job.done_bytes)
            with open(part, "ab" if resumed else "wb") as out:
                async for chunk in r.content.iter_chunked(CHUNK):
                    out.write(chunk)
                    job.done_bytes += len(chunk)
                    now = time.monotonic()
                    if now - last >= PROGRESS_EVERY_S:
                        t0, b0 = job._rate_from
                        job.bps = (job.done_bytes - b0) / (now - t0) if now > t0 else 0
                        job._rate_from = (now, job.done_bytes)
                        self.on_progress(job.progress())
                        last = now
        os.replace(part, dest)
