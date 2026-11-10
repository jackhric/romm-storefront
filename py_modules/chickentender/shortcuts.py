"""Which Steam shortcut belongs to which game. Steam creates shortcuts (frontend only); this remembers the appids."""
import json
import os
import tempfile


class ShortcutMap:
    def __init__(self, path: str):
        self.path = path
        self._by_rom: dict[int, dict] = {}
        try:
            with open(path, encoding="utf-8") as f:
                self._by_rom = {int(k): v for k, v in json.load(f).items()}
        except (OSError, ValueError):
            pass

    def appid(self, rom_id: int) -> int:
        return int(self._by_rom.get(rom_id, {}).get("appid", 0))

    def rom_id(self, appid: int) -> int | None:
        return next((r for r, v in self._by_rom.items() if v.get("appid") == appid), None)

    def set(self, rom_id: int, appid: int, name: str) -> None:
        if appid:
            self._by_rom[rom_id] = {"appid": appid, "name": name}
        else:
            self._by_rom.pop(rom_id, None)
        self._save()

    def forget(self, rom_id: int) -> int:
        appid = self.appid(rom_id)
        if rom_id in self._by_rom:
            del self._by_rom[rom_id]
            self._save()
        return appid

    def _save(self) -> None:
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(self.path), prefix=".shortcuts-")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump({str(k): v for k, v in self._by_rom.items()}, f, indent=2)
        os.replace(tmp, self.path)
