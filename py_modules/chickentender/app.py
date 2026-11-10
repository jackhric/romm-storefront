"""The one object main.py builds: settings, the RomM client, pairing, the library and downloads.

Every change ends in `emit(STATE_EVENT, state)`, so the panel and the library page only render the latest snapshot;
download progress goes out separately as `PROGRESS_EVENT` a couple of times a second.
"""
import asyncio
import base64
import hashlib
import logging
import os
import socket
from collections.abc import Awaitable, Callable
from typing import Any

import aiohttp

from .artwork import ArtCache, ArtPrefetch
from .downloads import Downloader, Job
from .install import DEFAULT_ROMS_DIR, InstallLocation, launch_file
from .library import Library
from .pairing import DevicePairing
from . import retrodeck
from .shortcuts import ShortcutMap
import shutil
from .romm import MIN_VERSION, RommClient, RommError, normalize_url, parse_version, ssl_context
from .sgdb import KINDS as ART_KINDS, SgdbClient, SgdbError
from .settings import Settings, SettingsStore
from .video import VideoResolver
from .signin import SgdbSignin

STATE_EVENT = "chickentender_state"
PROGRESS_EVENT = "chickentender_progress"
LIBRARY_REFRESH_S = 600
CLIENT = "chickentender"


def device_identity(version: str) -> dict:
    try:
        with open("/etc/machine-id") as f:
            machine = f.read().strip()
    except OSError:
        machine = socket.gethostname()
    return {
        "client_device_identifier": hashlib.sha256(machine.encode()).hexdigest()[:32],
        "name": socket.gethostname() or "Steam device",
        "client": CLIENT,
        "platform": "steamos",
        "client_version": version,
    }


class App:
    def __init__(self, settings_path: str, version: str, home: str,
                 emit: Callable[..., Awaitable[None]], logger: logging.Logger, data_dir: str = "",
                 sgdb_session_factory: Callable[[], Any] | None = None, browser: dict | None = None):
        self.store = SettingsStore(settings_path)
        self.settings: Settings = self.store.load()
        self.version = version
        self.home = home
        self.identity = device_identity(version)
        self._emit = emit
        self.log = logger
        self.client: RommClient | None = None
        self.pairing: DevicePairing | None = None
        self.server: dict[str, Any] = {"version": "", "error": ""}
        self.library = Library()
        self.videos = VideoResolver(log=logger)
        self.retrodeck = retrodeck.detect(home)
        self.shortcuts = ShortcutMap(os.path.join(os.path.dirname(settings_path), "shortcuts.json"))
        self.launcher = ""
        self.runtime_dir = ""
        self.location = InstallLocation(self.settings.roms_dir or self.retrodeck.roms_path or DEFAULT_ROMS_DIR, home)
        self.downloader: Downloader | None = None
        self._refresh_task: asyncio.Task | None = None
        if self.settings.server_url:
            self.client = RommClient(self.settings.server_url, self.settings.token)
        self.art = ArtCache(data_dir or os.path.dirname(settings_path))
        self._sgdb_session = sgdb_session_factory or (lambda: aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=30), connector=aiohttp.TCPConnector(ssl=ssl_context())))
        self.sgdb: SgdbClient | None = self._sgdb_client(self.settings.sgdb_key) if self.settings.sgdb_key else None
        self._cdn: SgdbClient | None = None
        self.sgdb_error = ""
        self.prefetch = ArtPrefetch(self.art, self._changed, self._art_failed, logger)
        self.signin = SgdbSignin(self._signin_key, self._changed, logger, **(browser or {}))

    # Lifecycle
    def install_launcher(self, source: str, runtime_dir: str) -> None:
        """Copies the shortcut launcher where the user can run it (the plugin dir is root-owned)."""
        self.runtime_dir = runtime_dir
        try:
            os.makedirs(runtime_dir, exist_ok=True)
            dest = os.path.join(runtime_dir, "chickentender-launch")
            shutil.copyfile(source, dest)
            os.chmod(dest, 0o755)
            self.launcher = dest
        except OSError as e:
            self.log.warning("launcher not installed: %s", e)

    async def start(self) -> None:
        if self.settings.paired:
            self._start_paired()
        elif self.client:
            asyncio.create_task(self._probe_server())

    async def stop(self) -> None:
        if self._refresh_task:
            self._refresh_task.cancel()
        if self.signin.active:
            await self.signin.cancel()
        await self.prefetch.stop()
        for c in (self.sgdb, self._cdn):
            if c:
                await c.close()
        if self.downloader:
            await self.downloader.stop()
        if self.pairing:
            await self.pairing.cancel()
        if self.client:
            await self.client.close()

    def _start_paired(self) -> None:
        assert self.client
        self.downloader = Downloader(self.client, self.location, self._progress, self._finished)
        self._refresh_task = asyncio.create_task(self._refresh_loop())

    # Snapshot
    def state(self) -> dict:
        s = self.settings
        status_of = self.downloader.status_of if self.downloader else (lambda rom_id: None)
        return {
            "server": {"url": s.server_url, **self.server},
            "pairing": self.pairing.state.as_dict() if self.pairing else {"status": "idle"},
            "account": {"paired": s.paired, "username": s.username, "device_id": s.device_id,
                        "device_name": self.identity["name"]},
            "library": self.library.snapshot(self.location, status_of, lambda g: self.art.urls(g.rom_id, g.sgdb_id, g.name)),
            "downloads": self.downloader.snapshot() if self.downloader else {"active": None, "queue": [], "roms_dir": self.location.roms_dir},
            "roms_dir_exists": self.location.exists,
            "retrodeck": self.retrodeck.as_dict(),
            "sgdb": {"configured": self.sgdb is not None, "error": self.sgdb_error,
                     "art_ready": self.art.count(self.library.games.values()), "art_total": len(self.library.games),
                     "signin": self.signin.as_dict()},
            "layout": s.layout,
            "version": self.version,
        }

    def _changed(self) -> None:
        asyncio.get_event_loop().create_task(self._emit(STATE_EVENT, self.state()))

    def _progress(self, progress: dict) -> None:
        asyncio.get_event_loop().create_task(self._emit(PROGRESS_EVENT, progress))

    async def _finished(self, job: Job) -> None:
        if job.status == "failed":
            self.log.warning("download of %s failed: %s", job.game.name, job.error)
        self._changed()

    def launch_target(self, rom_id: int) -> dict:
        """What a Steam shortcut for this game runs: the launcher with the ES-DE system and the ROM path."""
        game = self.library.games.get(int(rom_id))
        if not game:
            raise ValueError("Unknown game")
        target = self.location.target(game.slug, game.fs_name, game.single_file)
        system = os.path.basename(self.location.platform_dir(game.slug))
        return {
            "rom_id": game.rom_id, "name": game.name, "appid": self.shortcuts.appid(game.rom_id),
            "exe": self.launcher or "/usr/bin/false", "start_dir": os.path.dirname(target.path),
            "launch_options": f'{system} "{launch_file(target)}"', "cover": game.cover_large or game.cover,
            "installed": target.installed,
        }

    # Server and pairing
    async def set_server(self, url: str) -> dict:
        url = normalize_url(url)
        if not url:
            raise ValueError("Enter the RomM server address")
        if self.pairing:
            await self.pairing.cancel()
            self.pairing = None
        if self.client:
            await self.client.close()
        self.client = RommClient(url)
        await self._probe_server(emit=False)
        if self.settings.server_url != url:
            await self.prefetch.stop()
            self.settings = Settings(server_url=url, roms_dir=self.settings.roms_dir, sgdb_key=self.settings.sgdb_key, layout=self.settings.layout)
            self.store.save(self.settings)
            self.library = Library()
        self._changed()
        return self.state()

    async def _probe_server(self, emit: bool = True) -> None:
        assert self.client
        self.server = {"version": "", "error": ""}
        try:
            hb = await self.client.heartbeat()
            version = str(hb.get("SYSTEM", {}).get("VERSION", ""))
            self.server["version"] = version
            if parse_version(version) < MIN_VERSION:
                self.server["error"] = f"RomM {'.'.join(map(str, MIN_VERSION))} or newer is needed (this one is {version})"
        except RommError as e:
            self.server["error"] = f"Not a RomM server ({e.status})"
        except Exception as e:
            self.server["error"] = f"Cannot reach {self.client.base_url}: {e}"
        if emit:
            self._changed()

    async def start_pairing(self) -> dict:
        if not self.client or self.server.get("error"):
            raise ValueError("Connect to a RomM server first")
        if not self.pairing:
            self.pairing = DevicePairing(self.client, self.identity, self._changed, self._approved)
        await self.pairing.start()
        return self.state()

    async def cancel_pairing(self) -> dict:
        if self.pairing:
            await self.pairing.cancel()
        return self.state()

    async def _approved(self, token: dict) -> None:
        assert self.client
        self.client.token = token["access_token"]
        self.settings.token = token["access_token"]
        self.settings.device_id = token["device_id"]
        self.settings.scopes = list(token.get("scopes", []))
        try:
            me = await self.client.me()
            self.settings.username = me.get("username", "") if me else ""
        except Exception as e:
            self.log.warning("users/me failed after pairing: %s", e)
        self.store.save(self.settings)
        await self._describe_device()
        self.pairing = None
        self._start_paired()

    async def _describe_device(self) -> None:
        assert self.client
        try:
            await self.client.update_device(self.settings.device_id, {
                "client": CLIENT, "client_version": self.version, "platform": "steamos",
                "hostname": self.identity["name"], "capabilities": {},
            })
        except Exception as e:
            self.log.warning("device update failed: %s", e)

    async def disconnect(self) -> dict:
        if self._refresh_task:
            self._refresh_task.cancel()
            self._refresh_task = None
        await self.prefetch.stop()
        if self.downloader:
            await self.downloader.stop()
            self.downloader = None
        if self.pairing:
            await self.pairing.cancel()
            self.pairing = None
        if self.client:
            await self.client.close()
            self.client = None
        self.settings = Settings(roms_dir=self.settings.roms_dir, sgdb_key=self.settings.sgdb_key, layout=self.settings.layout)
        self.store.save(self.settings)
        self.server = {"version": "", "error": ""}
        self.library = Library()
        self._changed()
        return self.state()

    # Library and downloads
    async def refresh_library(self) -> dict:
        if self.settings.paired and self.client and not self.library.loading:
            await self.library.refresh(self.client)
            if self.library.error and "401" in self.library.error:
                self.library.error = "RomM no longer accepts this device; disconnect and pair again"
            elif not self.library.error and self.sgdb and not self.sgdb_error and not self.prefetch.running:
                self.prefetch.start(self.sgdb, self.library.games.values())
            self._changed()
        return self.state()

    async def _refresh_loop(self) -> None:
        if not self.server.get("version"):
            await self._probe_server(emit=False)
        await self._describe_device()
        while True:
            await self.refresh_library()
            await asyncio.sleep(LIBRARY_REFRESH_S)

    async def game_details(self, rom_id: int) -> dict:
        game = self.library.games.get(int(rom_id))
        if not game or not self.client:
            raise ValueError("Unknown game")
        return game.details(self.client)

    async def set_layout(self, layout: str) -> dict:
        self.settings.layout = str(layout)[:32]
        self.store.save(self.settings)
        self._changed()
        return self.state()

    async def game_video(self, rom_id: int) -> dict:
        """Direct stream addresses for the game's trailer ("" each when it has none or it cannot be resolved)."""
        game = self.library.games.get(int(rom_id))
        video_id = (game.raw.get("youtube_video_id") or "") if game else ""
        return {"rom_id": int(rom_id), **(await self.videos.resolve(video_id))}

    async def cover_base64(self, rom_id: int) -> dict:
        """The game's cover for Steam's custom artwork call (the Steam webview cannot fetch it cross-origin itself)."""
        game = self.library.games.get(int(rom_id))
        if not game or not self.client or not (game.cover_large or game.cover):
            return {"base64": "", "format": ""}
        data, _ctype = await self.client.fetch_bytes(game.cover_large or game.cover)
        # RomM labels every cover image/png whatever it holds; Steam needs the real format.
        fmt = "png" if data.startswith(b"\x89PNG") else "jpg" if data.startswith(b"\xff\xd8") else ""
        if not fmt:
            self.log.warning("cover of %s is neither PNG nor JPEG (%d bytes)", game.name, len(data))
            return {"base64": "", "format": ""}
        return {"base64": base64.b64encode(data).decode(), "format": fmt}

    # SteamGridDB artwork
    def _sgdb_client(self, key: str) -> SgdbClient:
        return SgdbClient(key, self._sgdb_session, f"ChickenTender/{self.version}")

    def _art_failed(self, e: SgdbError) -> None:
        self.sgdb_error = e.message
        self.log.warning("SteamGridDB prefetch stopped: %s", e.message)

    async def set_sgdb_key(self, key: str) -> dict:
        """Saves the key only once SteamGridDB accepts it; a refused key shows up as `sgdb.error`, never raises."""
        key = (key or "").strip()
        if not key:
            self.sgdb_error = "Enter a SteamGridDB API key"
            return self.state()
        client = self._sgdb_client(key)
        try:
            await client.verify()
        except SgdbError as e:
            await client.close()
            self.sgdb_error = "Invalid SteamGridDB key" if e.status in (401, 403) else e.message
            self._changed()
            return self.state()
        await self.prefetch.stop()
        if self.sgdb:
            await self.sgdb.close()
        self.sgdb, self.sgdb_error = client, ""
        self.settings.sgdb_key = key
        self.store.save(self.settings)
        if self.library.games:
            self.prefetch.start(client, self.library.games.values())
        self._changed()
        return self.state()

    async def _signin_key(self, key: str) -> str:
        await self.set_sgdb_key(key)
        return "" if self.sgdb is not None and not self.sgdb_error else (self.sgdb_error or "SteamGridDB did not accept the key")

    async def start_sgdb_signin(self) -> dict:
        self.signin.start()
        return self.state()

    async def cancel_sgdb_signin(self) -> dict:
        await self.signin.cancel()
        return self.state()

    async def clear_sgdb_key(self) -> dict:
        await self.prefetch.stop()
        if self.sgdb:
            await self.sgdb.close()
        self.sgdb, self.sgdb_error = None, ""
        self.settings.sgdb_key = ""
        self.store.save(self.settings)
        self._changed()
        return self.state()

    async def _art_entry(self, game) -> dict | None:
        """The game's cache entry, looked up now when missing; None without a key or when the lookup failed."""
        entry = self.art.get(game.rom_id, game.sgdb_id, game.name)
        if entry or not self.sgdb:
            return entry
        try:
            entry, fetched = await self.art.ensure(self.sgdb, game.rom_id, game.sgdb_id, game.name)
        except SgdbError as e:
            if e.status == 401:
                self.sgdb_error = "Invalid SteamGridDB key"
                self._changed()
            self.log.warning("SteamGridDB art for %s: %s", game.name, e.message)
            return None
        if fetched:
            self._changed()
        return entry

    async def game_art(self, rom_id: int) -> dict:
        game = self.library.games.get(int(rom_id))
        if not game:
            raise ValueError("Unknown game")
        entry = await self._art_entry(game)
        urls = {k: (entry or {}).get(k, "") for k in ART_KINDS}
        sgdb_id = (entry or {}).get("sgdb_id") or game.sgdb_id
        return {"rom_id": game.rom_id, "sgdb_id": sgdb_id, **urls, "ready": self.sgdb is not None}

    async def art_base64(self, rom_id: int, kind: str) -> dict:
        if kind not in ART_KINDS:
            raise ValueError(f"Unknown art kind {kind!r}")
        game = self.library.games.get(int(rom_id))
        if not game:
            raise ValueError("Unknown game")
        entry = await self._art_entry(game)
        if not entry or not entry.get(kind) or not entry.get("sgdb_id"):
            return {"base64": "", "format": ""}
        cached = self.art.image(entry["sgdb_id"], kind)
        if cached:
            data, fmt = cached
        else:
            client = self.sgdb or self._cdn
            if client is None:
                client = self._cdn = self._sgdb_client("")
            try:
                data, fmt = await client.fetch_image(entry[kind])
            except SgdbError as e:
                self.log.warning("SteamGridDB %s of %s: %s", kind, game.name, e.message)
                return {"base64": "", "format": ""}
            try:
                self.art.write_image(entry["sgdb_id"], kind, data, fmt)
            except OSError as e:
                self.log.warning("art cache not written: %s", e)
        return {"base64": base64.b64encode(data).decode(), "format": fmt}

    def _icon_path(self, rom_id: int) -> str:
        return os.path.join(self.runtime_dir, "icons", f"{int(rom_id)}.png") if self.runtime_dir else ""

    def save_icon(self, rom_id: int, data_base64: str) -> str:
        """Writes a shortcut icon drawn by the frontend; Steam takes a shortcut's icon only as a file path."""
        path = self._icon_path(rom_id)
        data = base64.b64decode(data_base64 or "", validate=True)
        if not path or not data.startswith(b"\x89PNG") or len(data) > 4 * 1024 * 1024:
            raise ValueError("Not a PNG icon")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = path + ".tmp"
        with open(tmp, "wb") as f:
            f.write(data)
        os.chmod(tmp, 0o644)
        os.replace(tmp, path)
        return path

    async def similar_games(self, rom_id: int) -> list[dict]:
        """Games in the library that resemble this one, from RomM's similarity graph."""
        if not self.client:
            return []
        out = []
        for r in await self.client.similar(int(rom_id)):
            sid = (r.get("rom") or {}).get("id")
            if sid in self.library.games:
                out.append({"rom_id": sid, "score": r.get("score", 0),
                            "reasons": [f"{x.get('facet', '')}: {x.get('value', '')}".strip(": ") for x in (r.get("reasons") or [])[:3]]})
        return out

    async def download(self, rom_id: int, appid: int = 0) -> dict:
        game = self.library.games.get(int(rom_id))
        if not game or not self.downloader:
            raise ValueError("Unknown game")
        if not self.location.exists:
            raise ValueError(f"The ROM folder {self.location.roms_dir} does not exist")
        if appid:
            self.shortcuts.set(game.rom_id, int(appid), game.name)
        self.downloader.add(game, self.shortcuts.appid(game.rom_id))
        self._changed()
        return self.state()

    async def set_shortcut(self, rom_id: int, appid: int) -> dict:
        game = self.library.games.get(int(rom_id))
        if not game:
            raise ValueError("Unknown game")
        self.shortcuts.set(game.rom_id, int(appid), game.name)
        if self.downloader:
            self.downloader.add_appid(game.rom_id, int(appid))
        self._changed()
        return self.state()

    async def remove(self, rom_id: int) -> dict:
        """Deletes the game's files; the frontend removes the Steam shortcut with the appid returned in `removed`."""
        game = self.library.games.get(int(rom_id))
        if not game:
            raise ValueError("Unknown game")
        if self.downloader:
            await self.downloader.cancel(game.rom_id)
            self.downloader.forget(game.rom_id)
        target = self.location.target(game.slug, game.fs_name, game.single_file)
        for path in (target.path, target.path + ".part"):
            if os.path.isdir(path):
                shutil.rmtree(path, ignore_errors=True)
            elif os.path.exists(path):
                os.unlink(path)
        icon = self._icon_path(game.rom_id)
        if icon and os.path.exists(icon):
            os.unlink(icon)
        appid = self.shortcuts.forget(game.rom_id)
        self._changed()
        return {"removed": appid, **self.state()}

    def _rom_id_for(self, appid: int) -> int | None:
        return self.shortcuts.rom_id(int(appid))

    async def download_control(self, action: str, appid: int = 0, value: int = 0) -> dict:
        """Steam's Downloads page buttons: pause/resume/cancel one of ours, pause_all/resume_all, move/move_to, clear."""
        d = self.downloader
        if not d:
            return self.state()
        rom_id = self._rom_id_for(appid) if appid else None
        if action == "pause_all":
            await d.pause_all()
        elif action == "resume_all":
            await d.resume_all()
        elif action == "clear":
            d.clear()
        elif rom_id is not None:
            if action == "pause":
                await d.pause(rom_id)
            elif action == "resume":
                await d.resume(rom_id)
            elif action == "cancel":
                await d.cancel(rom_id)
            elif action == "move":
                d.move(rom_id, int(value))
            elif action == "move_to":
                d.move_to(rom_id, int(value))
        self._changed()
        return self.state()

    async def cancel_download(self, rom_id: int) -> dict:
        if self.downloader:
            await self.downloader.cancel(int(rom_id))
        return self.state()

    async def set_roms_dir(self, path: str) -> dict:
        path = path.strip()
        self.retrodeck = retrodeck.detect(self.home)
        path = path or self.retrodeck.roms_path or DEFAULT_ROMS_DIR
        self.location = InstallLocation(path, self.home)
        if self.downloader:
            self.downloader.location = self.location
        self.settings.roms_dir = path
        self.store.save(self.settings)
        self._changed()
        return self.state()
