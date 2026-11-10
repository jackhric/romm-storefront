import json
import os

import decky
from chickentender.app import App


def _version() -> str:
    try:
        with open(os.path.join(decky.DECKY_PLUGIN_DIR, "package.json")) as f:
            return json.load(f).get("version", "0")
    except Exception:
        return "0"


class Plugin:
    app: App

    async def _main(self):
        self.app = App(os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "settings.json"), _version(),
                       decky.DECKY_USER_HOME, decky.emit, decky.logger, data_dir=decky.DECKY_PLUGIN_RUNTIME_DIR)
        self.app.install_launcher(os.path.join(decky.DECKY_PLUGIN_DIR, "bin", "chickentender-launch"), decky.DECKY_PLUGIN_RUNTIME_DIR)
        await self.app.start()
        decky.logger.info("ChickenTender %s started", self.app.version)

    async def _unload(self):
        await self.app.stop()

    async def get_state(self) -> dict:
        return self.app.state()

    async def set_server(self, url: str) -> dict:
        return await self.app.set_server(url)

    async def start_pairing(self) -> dict:
        return await self.app.start_pairing()

    async def cancel_pairing(self) -> dict:
        return await self.app.cancel_pairing()

    async def disconnect(self) -> dict:
        return await self.app.disconnect()

    async def refresh_library(self) -> dict:
        return await self.app.refresh_library()

    async def similar_games(self, rom_id: int) -> list:
        return await self.app.similar_games(rom_id)

    async def game_details(self, rom_id: int) -> dict:
        return await self.app.game_details(rom_id)

    async def download(self, rom_id: int, appid: int = 0) -> dict:
        return await self.app.download(rom_id, appid)

    async def cover_base64(self, rom_id: int) -> dict:
        return await self.app.cover_base64(rom_id)

    async def save_icon(self, rom_id: int, data_base64: str) -> str:
        return self.app.save_icon(rom_id, data_base64)

    async def launch_target(self, rom_id: int) -> dict:
        return self.app.launch_target(rom_id)

    async def set_shortcut(self, rom_id: int, appid: int) -> dict:
        return await self.app.set_shortcut(rom_id, appid)

    async def remove(self, rom_id: int) -> dict:
        return await self.app.remove(rom_id)

    async def download_control(self, action: str, appid: int = 0, value: int = 0) -> dict:
        return await self.app.download_control(action, appid, value)

    async def cancel_download(self, rom_id: int) -> dict:
        return await self.app.cancel_download(rom_id)

    async def set_sgdb_key(self, key: str) -> dict:
        return await self.app.set_sgdb_key(key)

    async def start_sgdb_signin(self) -> dict:
        return await self.app.start_sgdb_signin()

    async def cancel_sgdb_signin(self) -> dict:
        return await self.app.cancel_sgdb_signin()

    async def clear_sgdb_key(self) -> dict:
        return await self.app.clear_sgdb_key()

    async def game_art(self, rom_id: int) -> dict:
        return await self.app.game_art(rom_id)

    async def art_base64(self, rom_id: int, kind: str) -> dict:
        return await self.app.art_base64(rom_id, kind)

    async def set_roms_dir(self, path: str) -> dict:
        return await self.app.set_roms_dir(path)
