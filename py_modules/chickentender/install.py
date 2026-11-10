"""Where a game lives on the device: RetroDECK's ROM folder, one ES-DE system folder per RomM platform."""
import os
from dataclasses import dataclass

# RomM filesystem slugs that ES-DE / RetroDECK spell differently.
ESDE_FOLDER = {"ngc": "gc", "dc": "dreamcast", "genesis": "genesis", "md": "megadrive"}
DEFAULT_ROMS_DIR = "~/retrodeck/roms"


@dataclass(frozen=True)
class Target:
    """A game's place on disk: a single file, or a folder holding its files."""
    path: str
    is_dir: bool

    @property
    def installed(self) -> bool:
        if self.is_dir:
            try:
                names = os.listdir(self.path)
            except OSError:
                return False
            return any(not n.endswith(".part") for n in names)
        return os.path.isfile(self.path)

    @property
    def partial(self) -> bool:
        if self.is_dir:
            try:
                return any(n.endswith(".part") for n in os.listdir(self.path))
            except OSError:
                return False
        return os.path.isfile(self.path + ".part")


# What to hand the emulator for a multi-file game, best first: a playlist, then a disc image descriptor.
LAUNCH_EXTENSIONS = (".m3u", ".cue", ".gdi", ".ccd", ".mds", ".chd", ".cso", ".iso", ".rvz", ".gcz", ".nsp", ".xci", ".wua", ".wux")


def launch_file(target: Target) -> str:
    """The file a shortcut launches: the file itself, or the best candidate inside a game folder (the folder if empty)."""
    if not target.is_dir:
        return target.path
    try:
        names = sorted(n for n in os.listdir(target.path) if not n.endswith(".part"))
    except OSError:
        return target.path
    for ext in LAUNCH_EXTENSIONS:
        for n in names:
            if n.lower().endswith(ext):
                return os.path.join(target.path, n)
    files = [n for n in names if os.path.isfile(os.path.join(target.path, n))]
    if not files:
        return target.path
    return os.path.join(target.path, max(files, key=lambda n: os.path.getsize(os.path.join(target.path, n))))


class InstallLocation:
    def __init__(self, roms_dir: str, home: str):
        self.home = home
        self.roms_dir = os.path.expanduser(roms_dir.replace("~", home, 1) if roms_dir.startswith("~") else roms_dir)

    def platform_dir(self, fs_slug: str) -> str:
        for name in (ESDE_FOLDER.get(fs_slug), fs_slug):
            if name and os.path.isdir(os.path.join(self.roms_dir, name)):
                return os.path.join(self.roms_dir, name)
        return os.path.join(self.roms_dir, ESDE_FOLDER.get(fs_slug, fs_slug))

    def target(self, fs_slug: str, fs_name: str, single_file: bool) -> Target:
        return Target(os.path.join(self.platform_dir(fs_slug), fs_name), not single_file)

    @property
    def exists(self) -> bool:
        return os.path.isdir(self.roms_dir)
