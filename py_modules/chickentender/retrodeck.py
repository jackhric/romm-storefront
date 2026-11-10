"""What RetroDECK (the Flatpak) looks like on this device. Read-only: its config is the source of truth for folders."""
import json
import os
import shutil
import subprocess
from dataclasses import dataclass

APP_ID = "net.retrodeck.retrodeck"


@dataclass(frozen=True)
class RetroDeck:
    installed: bool
    initialised: bool   # first-run setup done (config and lock file exist)
    version: str
    roms_path: str

    def as_dict(self) -> dict:
        return {"installed": self.installed, "initialised": self.initialised, "version": self.version, "roms_path": self.roms_path}


def config_dir(home: str) -> str:
    return os.path.join(home, ".var", "app", APP_ID, "config", "retrodeck")


def detect(home: str) -> RetroDeck:
    cfg = os.path.join(config_dir(home), "retrodeck.json")
    version, roms_path = "", ""
    try:
        with open(cfg, encoding="utf-8") as f:
            data = json.load(f)
        version = str(data.get("version", ""))
        roms_path = str(data.get("paths", {}).get("roms_path", ""))
    except (OSError, ValueError):
        data = None
    installed = bool(shutil.which("flatpak")) and subprocess.run(
        ["flatpak", "info", APP_ID], capture_output=True, timeout=15).returncode == 0
    return RetroDeck(
        installed=installed,
        initialised=data is not None and os.path.exists(os.path.join(config_dir(home), ".lock")),
        version=version,
        roms_path=roms_path,
    )
