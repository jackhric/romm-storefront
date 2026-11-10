import json
import os
import tempfile
from dataclasses import asdict, dataclass, field, fields


@dataclass
class Settings:
    server_url: str = ""
    token: str = ""
    device_id: str = ""
    username: str = ""
    scopes: list[str] = field(default_factory=list)
    roms_dir: str = ""
    sgdb_key: str = ""
    layout: str = ""

    @property
    def paired(self) -> bool:
        return bool(self.server_url and self.token and self.device_id)


class SettingsStore:
    """One JSON file, written atomically and readable only by the owner (it holds the RomM token)."""

    def __init__(self, path: str):
        self.path = path

    def load(self) -> Settings:
        try:
            with open(self.path, encoding="utf-8") as f:
                data = json.load(f)
        except (FileNotFoundError, ValueError):
            return Settings()
        known = {f.name for f in fields(Settings)}
        return Settings(**{k: v for k, v in data.items() if k in known})

    def save(self, settings: Settings) -> None:
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(self.path), prefix=".settings-")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(asdict(settings), f, indent=2)
            os.chmod(tmp, 0o600)
            os.replace(tmp, self.path)
        except BaseException:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise
