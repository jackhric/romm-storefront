import asyncio
import json
import logging
import os

import pytest

from chickentender.app import App
from chickentender.artwork import ArtCache, ArtPrefetch
from chickentender.library import Game
from chickentender.sgdb import API, SgdbClient, SgdbError, best_icon, image_format

KEY = "secret-key-123"
PNG = b"\x89PNG\r\n\x1a\n" + b"p" * 20
JPG = b"\xff\xd8\xff\xe0" + b"j" * 20


class FakeResponse:
    def __init__(self, status, body=None, headers=None):
        self.status = status
        self.headers = headers or {}
        self._body = body
        self.content = self
        self.content_length = len(body) if isinstance(body, bytes) else None

    async def json(self, content_type=None):
        return self._body

    async def iter_chunked(self, n):
        for i in range(0, len(self._body), n):
            yield self._body[i:i + n]

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


class FakeSession:
    """Answers by path; `routes` maps an API path (or a full CDN URL) to a response or a list of them."""

    def __init__(self, routes):
        self.routes = routes
        self.calls = []
        self.closed = False

    def get(self, url, params=None, headers=None):
        path = url[len(API):] if url.startswith(API) else url
        self.calls.append((path, params or {}, headers or {}))
        r = self.routes.get(path)
        if isinstance(r, list):
            r = r.pop(0) if len(r) > 1 else r[0]
        if callable(r):
            r = r(params or {}, headers or {})
        return r or FakeResponse(404, {"success": False, "errors": ["Game not found"]})

    async def close(self):
        self.closed = True


def ok(data):
    return FakeResponse(200, {"success": True, "data": data})


def item(url, w, h, score=0, mime="image/png"):
    return {"id": hash(url) & 0xffff, "url": url, "width": w, "height": h, "score": score, "mime": mime}


async def no_sleep(_s):
    pass


def client(routes, sleeps=None):
    async def sleep(s):
        if sleeps is not None:
            sleeps.append(s)
    session = FakeSession(routes)
    return SgdbClient(KEY, lambda: session, "ChickenTender/1.0", sleep=sleep), session


def assets_routes(gid=42):
    def grids(params, _h):
        if "600x900" in params["dimensions"]:
            return ok([item("https://c/grid-low", 600, 900, 1), item("https://c/grid-odd", 512, 512, 9),
                       item("https://c/grid-best", 660, 930, 5), item("https://c/grid-tie", 600, 900, 5)])
        return ok([item("https://c/wide", 920, 430, 0)])
    return {
        f"/grids/game/{gid}": grids,
        f"/heroes/game/{gid}": ok([item("https://c/hero", 1920, 620, 2), item("https://c/hero-big", 3840, 1240, 2)]),
        f"/logos/game/{gid}": ok([item("https://c/logo-webp", 800, 300, 9, "image/webp"), item("https://c/logo", 800, 300, 1)]),
        f"/icons/game/{gid}": ok([item("https://c/icon-ico", 256, 256, 9, "image/vnd.microsoft.icon"),
                                  item("https://c/icon-32", 32, 32), item("https://c/icon-256", 256, 256), item("https://c/icon-512", 512, 512)]),
    }


async def test_pick_assets_filters_and_choices():
    c, s = client(assets_routes())
    assert await c.pick_assets(42) == {"grid": "https://c/grid-best", "wide": "https://c/wide", "hero": "https://c/hero",
                                       "logo": "https://c/logo", "icon": "https://c/icon-256"}
    assert len(s.calls) == 5
    for path, params, headers in s.calls:
        assert headers["Authorization"] == f"Bearer {KEY}" and headers["User-Agent"] == "ChickenTender/1.0"
        assert params["types"] == "static" and params["nsfw"] == params["humor"] == params["epilepsy"] == "false"
        assert params["limit"] == "10"
    by_path = {p: params for p, params, _ in s.calls if not p.startswith("/grids")}
    assert by_path["/heroes/game/42"]["dimensions"] == "1920x620,3840x1240,1600x650"
    assert by_path["/logos/game/42"]["mimes"] == "image/png" and "dimensions" not in by_path["/logos/game/42"]
    grid_dims = sorted(params["dimensions"] for p, params, _ in s.calls if p.startswith("/grids"))
    assert grid_dims == ["600x900,660x930,342x482", "920x430,460x215"]


async def test_missing_game_gives_no_art():
    c, _ = client({})
    assert await c.pick_assets(7) == dict.fromkeys(("grid", "wide", "hero", "logo", "icon"), "")


def test_icon_falls_back_to_smallest_larger_png():
    assert best_icon([item("a", 1024, 1024), item("b", 512, 512), item("c", 64, 64, mime="image/x-icon")]) == "b"
    assert best_icon([]) == ""


async def test_find_needs_an_exact_title():
    c, _ = client({"/search/autocomplete/Zelda%3A%20Link%27s%20Awakening": ok([
        {"id": 1, "name": "The Legend of Zelda: Link's Awakening"}, {"id": 2, "name": "zelda links awakening"}])})
    assert await c.find("Zelda: Link's Awakening") == 2
    c, _ = client({"/search/autocomplete/Contra": ok([{"id": 3, "name": "Contra III"}])})
    assert await c.find("Contra") is None


async def test_429_backs_off_then_succeeds():
    sleeps = []
    c, _ = client({"/search/autocomplete/a": [
        FakeResponse(429, {}, {"Retry-After": "2"}), FakeResponse(429, {}), FakeResponse(429, {}), ok([])]}, sleeps)
    assert await c.verify() is True
    assert sleeps == [2.0, 5.0, 10.0]


async def test_bad_key_message_never_carries_the_key():
    c, _ = client({"/search/autocomplete/a": FakeResponse(401, {"success": False, "errors": ["Authentication Required"]})})
    with pytest.raises(SgdbError) as e:
        await c.verify()
    assert e.value.status == 401 and e.value.message == "Invalid SteamGridDB key" and KEY not in str(e.value)


async def test_fetch_image_detects_format_and_sends_no_key():
    url = "https://cdn2.steamgriddb.com/grid/x.png"
    c, s = client({url: FakeResponse(200, PNG), "https://cdn2.steamgriddb.com/bad": FakeResponse(200, b"GIF89a....")})
    assert await c.fetch_image(url) == (PNG, "png")
    assert "Authorization" not in s.calls[0][2]
    with pytest.raises(SgdbError):
        await c.fetch_image("https://cdn2.steamgriddb.com/bad")
    with pytest.raises(SgdbError):
        await c.fetch_image(url, max_bytes=10)
    assert image_format(b"RIFF\0\0\0\0WEBPVP8 ") == "webp" and image_format(JPG) == "jpg"


def game(rom_id, name="Game", sgdb_id=42):
    return Game(rom_id=rom_id, name=name, platform_id=1, platform="P", slug="nes", fs_name=f"{rom_id}.nes",
                single_file=True, size_bytes=1, cover="", sgdb_id=sgdb_id)


async def test_cache_persists_entries_and_negative_ones(tmp_path):
    routes = assets_routes()
    routes["/search/autocomplete/Unknown"] = ok([])
    c, s = client(routes)
    cache = ArtCache(str(tmp_path))
    entry, fetched = await cache.ensure(c, 1, 42, "Game")
    assert fetched and entry["grid"] == "https://c/grid-best" and entry["sgdb_id"] == 42
    neg, _ = await cache.ensure(c, 2, None, "Unknown")
    assert neg["sgdb_id"] is None and neg["hero"] == ""
    calls = len(s.calls)

    again = ArtCache(str(tmp_path))
    assert again.urls(1, 42, "Game")["icon"] == "https://c/icon-256"
    assert (await again.ensure(c, 2, None, "Unknown"))[1] is False
    assert len(s.calls) == calls
    assert again.get(1, 43, "Game") is None  # RomM rematched the game: fetch again
    assert again.count([game(1), game(2, "Unknown", None), game(3)]) == 2
    index = json.loads((tmp_path / "sgdb" / "index.json").read_text())
    assert set(index) == {"1", "2"} and "fetched_at" in index["1"]

    again.write_image(42, "grid", PNG, "png")
    assert again.image(42, "grid") == (PNG, "png")
    assert os.path.exists(tmp_path / "sgdb" / "42" / "grid.png")


async def test_concurrent_lookups_share_one_request(tmp_path):
    c, s = client(assets_routes())
    cache = ArtCache(str(tmp_path))
    (a, fa), (b, fb) = await asyncio.gather(cache.ensure(c, 1, 42, "Game"), cache.ensure(c, 1, 42, "Game"))
    assert a == b and len(s.calls) == 5 and fa != fb


async def test_prefetch_fills_the_cache_and_reports_every_ten(tmp_path):
    routes = {}
    for gid in range(100, 125):
        routes.update(assets_routes(gid))
    c, _ = client(routes)
    cache = ArtCache(str(tmp_path))
    changes, errors = [], []
    pf = ArtPrefetch(cache, lambda: changes.append(pf.done), errors.append, logging.getLogger("t"))
    games = [game(i, f"G{i}", 100 + i) for i in range(25)]
    pf.start(c, games)
    assert pf.total == 25
    await pf.task
    assert cache.count(games) == 25 and pf.done == 25 and not errors
    assert changes == [10, 20, 25]
    pf.start(c, games)
    assert pf.total == 0 and not pf.running


async def test_prefetch_stops_on_a_rejected_key(tmp_path):
    c, s = client({"/grids/game/42": FakeResponse(401, {})})
    errors = []
    pf = ArtPrefetch(ArtCache(str(tmp_path)), lambda: None, errors.append, logging.getLogger("t"))
    pf.start(c, [game(i) for i in range(20)])
    await pf.task
    assert len(errors) == 1 and errors[0].status == 401 and pf.done < 20


async def _noop(*_a):
    pass


def make_app(tmp_path, routes):
    session = FakeSession(routes)
    app = App(str(tmp_path / "settings.json"), "1.0", str(tmp_path), _noop, logging.getLogger("t"),
              data_dir=str(tmp_path / "data"), sgdb_session_factory=lambda: session)
    app.library.games = {1: game(1), 2: game(2, "Nothing", None)}
    return app, session


async def test_app_key_flow_and_art(tmp_path, caplog):
    routes = assets_routes()
    routes["/search/autocomplete/a"] = [FakeResponse(401, {}), ok([])]
    routes["/search/autocomplete/Nothing"] = ok([])
    routes["https://c/grid-best"] = FakeResponse(200, JPG)
    app, session = make_app(tmp_path, routes)
    caplog.set_level(logging.DEBUG)

    st = await app.set_sgdb_key(KEY)
    assert st["sgdb"] == {"configured": False, "error": "Invalid SteamGridDB key", "art_ready": 0, "art_total": 2,
                          "signin": {"active": False, "stage": "", "error": ""}}
    assert app.store.load().sgdb_key == ""
    assert (await app.game_art(1))["ready"] is False

    st = await app.set_sgdb_key(f"  {KEY} ")
    assert st["sgdb"]["configured"] and st["sgdb"]["error"] == ""
    assert app.store.load().sgdb_key == KEY
    await app.prefetch.task
    st = app.state()
    assert st["sgdb"]["art_ready"] == 2
    art = {g["rom_id"]: g["art"] for g in st["library"]["games"]}
    assert art[1]["hero"] == "https://c/hero" and art[2] == dict.fromkeys(("grid", "wide", "hero", "logo", "icon"), "")

    assert await app.game_art(1) == {"rom_id": 1, "sgdb_id": 42, "grid": "https://c/grid-best", "wide": "https://c/wide",
                                     "hero": "https://c/hero", "logo": "https://c/logo", "icon": "https://c/icon-256", "ready": True}
    with pytest.raises(ValueError):
        await app.art_base64(1, "banner")
    assert await app.art_base64(2, "grid") == {"base64": "", "format": ""}
    first = await app.art_base64(1, "grid")
    assert first["format"] == "jpg"
    cdn_calls = sum(1 for p, _, _ in session.calls if p == "https://c/grid-best")
    assert await app.art_base64(1, "grid") == first
    assert sum(1 for p, _, _ in session.calls if p == "https://c/grid-best") == cdn_calls == 1

    st = await app.disconnect()
    assert app.settings.sgdb_key == KEY and st["sgdb"]["configured"]
    st = await app.clear_sgdb_key()
    assert not st["sgdb"]["configured"] and app.store.load().sgdb_key == ""
    assert KEY not in caplog.text and KEY not in json.dumps(st)
    await app.stop()
