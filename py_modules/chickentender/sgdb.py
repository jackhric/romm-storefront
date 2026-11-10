"""SteamGridDB: the few API calls the artwork needs, and image downloads from its CDN (which needs no key).

The key goes only into the Authorization header; no error message, log line or state carries it.
"""
import asyncio
import re
from collections.abc import Awaitable, Callable
from typing import Any
from urllib.parse import quote, urlsplit

import aiohttp

API = "https://www.steamgriddb.com/api/v2"
KINDS = ("grid", "wide", "hero", "logo", "icon")
SAFE = {"types": "static", "nsfw": "false", "humor": "false", "epilepsy": "false", "limit": 10}
PORTRAIT = ((600, 900), (660, 930), (342, 482))
WIDE = ((920, 430), (460, 215))
HEROES = ((1920, 620), (3840, 1240), (1600, 650))
ICON_MAX = 256
MAX_429_RETRIES = 4


class SgdbError(Exception):
    def __init__(self, status: int, message: str):
        self.status = status
        self.message = message
        super().__init__(message)


def _dims(sizes) -> str:
    return ",".join(f"{w}x{h}" for w, h in sizes)


def _param(v: Any) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (list, tuple)):
        return ",".join(map(str, v))
    return str(v)


def title_key(name: str) -> str:
    return re.sub(r"[\W_]+", "", name.casefold())


def image_format(data: bytes) -> str:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return ""


def best_by_score(items: list[dict], sizes=None, mime: str = "") -> str:
    """The highest-scored item (first on ties) of an allowed size and type."""
    best = None
    for it in items:
        if sizes and (it.get("width"), it.get("height")) not in sizes:
            continue
        if mime and it.get("mime") != mime:
            continue
        if not it.get("url"):
            continue
        if best is None or (it.get("score") or 0) > (best.get("score") or 0):
            best = it
    return best["url"] if best else ""


def best_icon(items: list[dict]) -> str:
    """The largest PNG icon up to 256 px, else the smallest larger one (Steam wants a PNG, never an .ico)."""
    pngs = [it for it in items if it.get("mime") == "image/png" and it.get("url")
            and isinstance(it.get("width"), int) and isinstance(it.get("height"), int)]
    small = [it for it in pngs if max(it["width"], it["height"]) <= ICON_MAX]
    if small:
        return max(small, key=lambda it: (max(it["width"], it["height"]), it.get("score") or 0))["url"]
    if pngs:
        return min(pngs, key=lambda it: (max(it["width"], it["height"]), -(it.get("score") or 0)))["url"]
    return ""


class SgdbClient:
    def __init__(self, key: str, session_factory: Callable[[], Any], user_agent: str,
                 sleep: Callable[[float], Awaitable[None]] = asyncio.sleep):
        self._key = key
        self._factory = session_factory
        self._ua = user_agent
        self._sleep = sleep
        self._session = None
        self._sem = asyncio.Semaphore(2)

    @property
    def configured(self) -> bool:
        return bool(self._key)

    async def close(self) -> None:
        if self._session is not None:
            await self._session.close()
            self._session = None

    def _get_session(self):
        if self._session is None or getattr(self._session, "closed", False):
            self._session = self._factory()
        return self._session

    async def _get(self, path: str, params: dict | None = None) -> Any:
        headers = {"Authorization": f"Bearer {self._key}", "Accept": "application/json", "User-Agent": self._ua}
        query = {k: _param(v) for k, v in (params or {}).items()}
        delay = 5.0
        async with self._sem:
            for attempt in range(MAX_429_RETRIES + 1):
                try:
                    async with self._get_session().get(API + path, params=query, headers=headers) as r:
                        if r.status == 429 and attempt < MAX_429_RETRIES:
                            wait = _retry_after(r.headers.get("Retry-After"))
                            if not wait:
                                wait, delay = delay, delay * 2
                        elif r.status >= 400:
                            raise SgdbError(r.status, await _message(r))
                        else:
                            body = await r.json(content_type=None)
                            if isinstance(body, dict) and body.get("success") is False:
                                raise SgdbError(r.status, _errors(body) or "SteamGridDB refused the request")
                            return body.get("data") if isinstance(body, dict) else body
                except (aiohttp.ClientError, asyncio.TimeoutError, OSError) as e:
                    raise SgdbError(0, f"Cannot reach SteamGridDB ({type(e).__name__})") from None
                await self._sleep(wait)
        raise SgdbError(429, "SteamGridDB rate limit")

    async def _assets(self, kind: str, game_id: int, filters: dict) -> list[dict]:
        try:
            data = await self._get(f"/{kind}/game/{int(game_id)}", filters)
        except SgdbError as e:
            if e.status == 404:
                return []
            raise
        return [it for it in data or [] if isinstance(it, dict)]

    async def verify(self) -> bool:
        await self._get("/search/autocomplete/a")
        return True

    async def search(self, term: str) -> list[dict]:
        try:
            return list(await self._get(f"/search/autocomplete/{quote(term, safe='')}") or [])
        except SgdbError as e:
            if e.status == 404:
                return []
            raise

    async def find(self, name: str) -> int | None:
        """A game id for a title, only when SteamGridDB has that exact title (ignoring case and punctuation)."""
        want = title_key(name)
        if not want:
            return None
        for hit in await self.search(name):
            if title_key(str(hit.get("name") or "")) == want and isinstance(hit.get("id"), int):
                return hit["id"]
        return None

    async def grids(self, game_id: int, **filters) -> list[dict]:
        return await self._assets("grids", game_id, filters)

    async def heroes(self, game_id: int, **filters) -> list[dict]:
        return await self._assets("heroes", game_id, filters)

    async def logos(self, game_id: int, **filters) -> list[dict]:
        return await self._assets("logos", game_id, filters)

    async def icons(self, game_id: int, **filters) -> list[dict]:
        return await self._assets("icons", game_id, filters)

    async def pick_assets(self, game_id: int) -> dict:
        grid, wide, hero, logo, icon = await asyncio.gather(
            self.grids(game_id, dimensions=_dims(PORTRAIT), **SAFE),
            self.grids(game_id, dimensions=_dims(WIDE), **SAFE),
            self.heroes(game_id, dimensions=_dims(HEROES), **SAFE),
            self.logos(game_id, mimes="image/png", **SAFE),
            self.icons(game_id, mimes="image/png", **SAFE),
        )
        return {
            "grid": best_by_score(grid, PORTRAIT),
            "wide": best_by_score(wide, WIDE),
            "hero": best_by_score(hero, HEROES),
            "logo": best_by_score(logo, mime="image/png"),
            "icon": best_icon(icon),
        }

    async def fetch_image(self, url: str, max_bytes: int = 12 << 20) -> tuple[bytes, str]:
        if urlsplit(url).scheme != "https":
            raise SgdbError(400, "Not an image URL")
        try:
            async with self._get_session().get(url, headers={"User-Agent": self._ua}) as r:
                if r.status >= 400:
                    raise SgdbError(r.status, f"Image download failed (HTTP {r.status})")
                if (r.content_length or 0) > max_bytes:
                    raise SgdbError(413, "Image too large")
                data = bytearray()
                async for chunk in r.content.iter_chunked(1 << 16):
                    data += chunk
                    if len(data) > max_bytes:
                        raise SgdbError(413, "Image too large")
        except (aiohttp.ClientError, asyncio.TimeoutError, OSError) as e:
            raise SgdbError(0, f"Cannot reach SteamGridDB ({type(e).__name__})") from None
        fmt = image_format(bytes(data[:16]))
        if not fmt:
            raise SgdbError(415, "Not a PNG, JPEG or WebP image")
        return bytes(data), fmt


def _retry_after(value: str | None) -> float:
    try:
        return max(0.0, min(float(value), 300.0)) if value else 0.0
    except ValueError:
        return 0.0


def _errors(body: dict) -> str:
    errs = body.get("errors")
    return "; ".join(map(str, errs))[:200] if isinstance(errs, list) else ""


async def _message(r) -> str:
    if r.status == 401:
        return "Invalid SteamGridDB key"
    try:
        body = await r.json(content_type=None)
        msg = _errors(body) if isinstance(body, dict) else ""
    except Exception:
        msg = ""
    return msg or f"SteamGridDB answered HTTP {r.status}"
