"""SteamGridDB art per game: which images were picked (index.json), the downloaded files, and the background prefetch.

An entry is keyed by rom_id and remembers what it was matched on (RomM's sgdb_id, else the title), so a rematch
in RomM or a different server's rom_ids refetch, while a game SteamGridDB lacks is not asked about again.
"""
import asyncio
import glob
import json
import logging
import os
import tempfile
import time
from collections.abc import Callable, Iterable

from .sgdb import KINDS, SgdbClient, SgdbError, title_key

EMPTY = {k: "" for k in KINDS}
FORMATS = ("png", "jpg", "webp")


def match_key(sgdb_id: int | None, name: str) -> str:
    return f"id:{sgdb_id}" if sgdb_id else f"name:{title_key(name)}"


class ArtCache:
    def __init__(self, dir: str):
        self.root = os.path.join(dir, "sgdb")
        self.index_path = os.path.join(self.root, "index.json")
        self._index: dict[int, dict] = {}
        self._dirty = False
        self._inflight: dict[int, asyncio.Future] = {}
        try:
            with open(self.index_path, encoding="utf-8") as f:
                self._index = {int(k): v for k, v in json.load(f).items() if isinstance(v, dict)}
        except (OSError, ValueError):
            pass

    def get(self, rom_id: int, sgdb_id: int | None, name: str) -> dict | None:
        e = self._index.get(int(rom_id))
        return e if e and e.get("match") == match_key(sgdb_id, name) else None

    def urls(self, rom_id: int, sgdb_id: int | None, name: str) -> dict:
        e = self.get(rom_id, sgdb_id, name)
        return {k: e.get(k, "") for k in KINDS} if e else dict(EMPTY)

    def count(self, games: Iterable) -> int:
        return sum(1 for g in games if self.get(g.rom_id, g.sgdb_id, g.name))

    def put(self, rom_id: int, sgdb_id: int | None, name: str, resolved: int | None, urls: dict) -> dict:
        old = self._index.get(int(rom_id))
        if old and old.get("sgdb_id"):
            for k in KINDS:
                if old.get("sgdb_id") != resolved or old.get(k) != urls.get(k, ""):
                    self._drop_image(old["sgdb_id"], k)
        entry = {"sgdb_id": resolved, **{k: urls.get(k, "") for k in KINDS},
                 "match": match_key(sgdb_id, name), "fetched_at": time.time()}
        self._index[int(rom_id)] = entry
        self._dirty = True
        return entry

    def save(self) -> None:
        if not self._dirty:
            return
        os.makedirs(self.root, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=self.root, prefix=".index-")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump({str(k): v for k, v in self._index.items()}, f)
            os.replace(tmp, self.index_path)
        except BaseException:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise
        self._dirty = False

    def _image_dir(self, sgdb_id: int) -> str:
        return os.path.join(self.root, str(int(sgdb_id)))

    def image(self, sgdb_id: int, kind: str) -> tuple[bytes, str] | None:
        for fmt in FORMATS:
            try:
                with open(os.path.join(self._image_dir(sgdb_id), f"{kind}.{fmt}"), "rb") as f:
                    return f.read(), fmt
            except OSError:
                continue
        return None

    def write_image(self, sgdb_id: int, kind: str, data: bytes, fmt: str) -> None:
        d = self._image_dir(sgdb_id)
        os.makedirs(d, exist_ok=True)
        self._drop_image(sgdb_id, kind)
        fd, tmp = tempfile.mkstemp(dir=d, prefix=f".{kind}-")
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        os.replace(tmp, os.path.join(d, f"{kind}.{fmt}"))

    def _drop_image(self, sgdb_id: int, kind: str) -> None:
        for path in glob.glob(os.path.join(self._image_dir(sgdb_id), f"{kind}.*")):
            try:
                os.unlink(path)
            except OSError:
                pass

    async def ensure(self, client: SgdbClient, rom_id: int, sgdb_id: int | None, name: str,
                     persist: bool = True) -> tuple[dict, bool]:
        """The cached entry, fetching it first when missing; the flag says whether it was fetched now.

        Concurrent callers for one game share a single lookup (the game page and the prefetch often overlap)."""
        cached = self.get(rom_id, sgdb_id, name)
        if cached:
            return cached, False
        fut = self._inflight.get(int(rom_id))
        if fut:
            return await asyncio.shield(fut), False
        fut = asyncio.ensure_future(self._lookup(client, rom_id, sgdb_id, name))
        self._inflight[int(rom_id)] = fut
        entry = await asyncio.shield(fut)
        if persist:
            self.save()
        return entry, True

    def cancel_lookups(self) -> None:
        for fut in list(self._inflight.values()):
            fut.cancel()
        self._inflight.clear()

    async def _lookup(self, client: SgdbClient, rom_id: int, sgdb_id: int | None, name: str) -> dict:
        try:
            resolved = sgdb_id or await client.find(name)
            urls = await client.pick_assets(resolved) if resolved else EMPTY
            return self.put(rom_id, sgdb_id, name, resolved, urls)
        finally:
            self._inflight.pop(int(rom_id), None)


class ArtPrefetch:
    """Fills the cache for every listed game in the background, two games at a time."""

    BATCH = 10
    MAX_FAILURES = 5

    def __init__(self, cache: ArtCache, changed: Callable[[], None], on_error: Callable[[SgdbError], None],
                 logger: logging.Logger):
        self.cache = cache
        self.changed = changed
        self.on_error = on_error
        self.log = logger
        self.task: asyncio.Task | None = None
        self.done = 0
        self.total = 0

    @property
    def running(self) -> bool:
        return self.task is not None and not self.task.done()

    def start(self, client: SgdbClient, games: Iterable) -> None:
        todo = sorted((g for g in games if not self.cache.get(g.rom_id, g.sgdb_id, g.name)), key=lambda g: g.rom_id)
        if self.running:
            self.task.cancel()
        self.done, self.total = 0, len(todo)
        if todo:
            self.task = asyncio.create_task(self._run(client, todo))

    async def stop(self) -> None:
        task, self.task = self.task, None
        # Lookups are shielded from their callers, so they would outlive the client being closed now.
        self.cache.cancel_lookups()
        if task and not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass

    async def _run(self, client: SgdbClient, todo: list) -> None:
        queue: asyncio.Queue = asyncio.Queue()
        for g in todo:
            queue.put_nowait(g)
        failures = 0

        async def worker():
            nonlocal failures
            while not queue.empty():
                g = queue.get_nowait()
                try:
                    await self.cache.ensure(client, g.rom_id, g.sgdb_id, g.name, persist=False)
                    failures = 0
                except SgdbError as e:
                    if e.status == 401:
                        raise
                    failures += 1
                    self.log.warning("SteamGridDB art for %s: %s", g.name, e.message)
                    if failures >= self.MAX_FAILURES:
                        raise
                self.done += 1
                if self.done % self.BATCH == 0:
                    self.cache.save()
                    self.changed()

        try:
            async with asyncio.TaskGroup() as tg:
                tg.create_task(worker())
                tg.create_task(worker())
        except* SgdbError as eg:
            self.on_error(eg.exceptions[0])
        finally:
            self.cache.save()
            self.changed()
