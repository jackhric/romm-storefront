"""The RomM HTTP API (5.4+): only the calls ChickenTender makes, one method each, no retries or caching."""
import os
import re
import ssl
from typing import Any
from urllib.parse import quote

import aiohttp

MIN_VERSION = (5, 4, 1)


class RommError(Exception):
    def __init__(self, status: int, detail: Any, url: str = ""):
        self.status = status
        self.detail = detail
        self.url = url
        super().__init__(f"{status} {detail}" if detail else f"HTTP {status}")

    @property
    def code(self) -> str:
        """The bare error code RomM puts in `detail`, e.g. `authorization_pending`."""
        return self.detail if isinstance(self.detail, str) else ""


def normalize_url(url: str) -> str:
    url = url.strip().rstrip("/")
    if url and "://" not in url:
        url = "https://" + url
    return url


def parse_version(text: str) -> tuple[int, ...]:
    parts = []
    for p in text.split("."):
        digits = re.match(r"\d+", p)
        if not digits:
            break
        parts.append(int(digits.group()))
    return tuple(parts)


def ssl_context() -> ssl.SSLContext:
    # The loader's bundled OpenSSL may not know the system CA path; add what we can find.
    ctx = ssl.create_default_context()
    try:
        import certifi  # shipped in the Decky Loader bundle

        ctx.load_verify_locations(certifi.where())
    except Exception:
        pass
    for path in ("/etc/pki/tls/certs/ca-bundle.crt", "/etc/ssl/certs/ca-certificates.crt"):
        if os.path.exists(path):
            try:
                ctx.load_verify_locations(path)
            except Exception:
                pass
    return ctx


class RommClient:
    def __init__(self, base_url: str, token: str = "", timeout: float = 20):
        self.base_url = normalize_url(base_url)
        self.token = token
        self._timeout = aiohttp.ClientTimeout(total=timeout)
        self._session: aiohttp.ClientSession | None = None

    async def close(self) -> None:
        if self._session is not None:
            await self._session.close()
            self._session = None

    def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=self._timeout, connector=aiohttp.TCPConnector(ssl=ssl_context())
            )
        return self._session

    async def request(self, method: str, path: str, *, json: Any = None, params: dict | None = None) -> Any:
        url = self.base_url + path
        headers = {"Accept": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        async with self._get_session().request(method, url, json=json, params=params, headers=headers) as r:
            if r.status >= 400:
                try:
                    body = await r.json()
                    detail = body.get("detail", body) if isinstance(body, dict) else body
                except Exception:
                    detail = (await r.text())[:300]
                raise RommError(r.status, detail, url)
            if r.status == 204 or r.content_length == 0:
                return None
            return await r.json()

    def url(self, path: str) -> str:
        """An absolute URL for a server-relative path such as `path_cover_small`."""
        return path if "://" in path else self.base_url + path

    # Open endpoints
    async def heartbeat(self) -> dict:
        return await self.request("GET", "/api/heartbeat")

    async def device_auth_init(self, payload: dict) -> dict:
        return await self.request("POST", "/api/auth/device/init", json=payload)

    async def device_auth_token(self, device_code: str) -> dict:
        return await self.request("POST", "/api/auth/device/token", json={"device_code": device_code})

    # Authenticated
    async def me(self) -> dict:
        return await self.request("GET", "/api/users/me")

    async def update_device(self, device_id: str, payload: dict) -> dict:
        return await self.request("PUT", f"/api/devices/{quote(device_id, safe='')}", json=payload)

    async def platforms(self) -> list[dict]:
        return await self.request("GET", "/api/platforms")

    async def recommendations(self, limit: int = 20) -> list[dict]:
        """RomM's personalised feed: [{rom, score, reasons: [{facet, value}], seed_rom_id, seed_rom_name}]."""
        return await self.request("GET", "/api/recommendations", params={"limit": limit})

    async def similar(self, rom_id: int, limit: int = 12) -> list[dict]:
        return await self.request("GET", f"/api/roms/{rom_id}/similar", params={"limit": limit})

    async def rom(self, rom_id: int) -> dict:
        return await self.request("GET", f"/api/roms/{rom_id}")

    async def roms(self, limit: int = 500) -> list[dict]:
        """Every ROM, in pages (the list endpoint's extras are switched off; `files` is empty here)."""
        items: list[dict] = []
        while True:
            page = await self.request("GET", "/api/roms", params={
                "limit": limit, "offset": len(items), "order_by": "name", "order_dir": "asc",
                "with_char_index": "false", "with_filter_values": "false", "with_rom_id_index": "false",
            })
            items.extend(page["items"])
            if len(items) >= page.get("total", 0) or not page["items"]:
                return items

    async def fetch_bytes(self, url: str, max_bytes: int = 8 << 20) -> tuple[bytes, str]:
        """A small public asset (a cover) and its content type."""
        async with self._get_session().get(self.url(url)) as r:
            if r.status >= 400:
                raise RommError(r.status, "", url)
            if (r.content_length or 0) > max_bytes:
                raise RommError(413, "asset too large", url)
            return await r.read(), r.headers.get("Content-Type", "")

    def content(self, rom_id: int, file_id: int, file_name: str, start: int = 0) -> "aiohttp.client._RequestContextManager":
        """Stream one file of a ROM; `start` resumes with a Range request. Use as `async with`."""
        headers = {"Authorization": f"Bearer {self.token}"}
        if start:
            headers["Range"] = f"bytes={start}-"
        return self._get_session().get(
            self.base_url + f"/api/roms/{rom_id}/content/{quote(file_name)}",
            params={"file_ids": str(file_id), "purpose": "download"}, headers=headers,
            timeout=aiohttp.ClientTimeout(total=None, sock_read=60),
        )
