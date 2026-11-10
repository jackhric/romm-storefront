"""Downloads, one at a time, straight into the game's target: every file streams to `<name>.part` and resumes from it.

Jobs keep the order they were queued in; pause keeps a job's place, cancel drops it. Finished jobs stay listed
(like Steam's "Completed" rows) until `clear()`.
"""
import asyncio
import os
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

from .install import InstallLocation
from .library import Game
from .romm import RommClient, RommError

CHUNK = 1 << 18
PROGRESS_EVERY_S = 0.5
GAME_FILE_CATEGORIES = (None, "game")
ACTIVE = ("queued", "downloading", "paused")


@dataclass
class Job:
    game: Game
    appid: int = 0
    done_bytes: int = 0
    total_bytes: int = 0
    bps: float = 0
    status: str = "queued"  # queued | downloading | paused | done | failed | cancelled
    error: str = ""
    started_at: float = 0
    completed_at: float = 0
    task: asyncio.Task | None = None
    _rate_from: tuple[float, int] = field(default=(0.0, 0))

    def progress(self) -> dict:
        return {"rom_id": self.game.rom_id, "appid": self.appid, "done_bytes": self.done_bytes, "total_bytes": self.total_bytes,
                "bps": self.bps, "status": self.status, "error": self.error}

    def view(self, queue_index: int) -> dict:
        """The shape Steam's Downloads page bridge renders (see src/steam/inject.ts OurDownload)."""
        active = self.status == "downloading"
        remaining = self.total_bytes - self.done_bytes
        return {
            "appid": self.appid, "rom_id": self.game.rom_id, "name": self.game.name,
            "bytes_total": self.total_bytes or self.game.size_bytes, "bytes_done": self.done_bytes,
            "rate": self.bps if active else 0,
            "eta": int(remaining / self.bps) if active and self.bps > 0 else -1,
            "state": "done" if self.status == "done" else "paused" if self.status == "paused" else "downloading" if active else "queued",
            "queue_index": queue_index, "completed_at": int(self.completed_at), "started_at": int(self.started_at),
        }


class Downloader:
    def __init__(self, client: RommClient, location: InstallLocation,
                 on_progress: Callable[[dict], None], on_finished: Callable[[Job], Awaitable[None]]):
        self.client = client
        self.location = location
        self.on_progress = on_progress
        self.on_finished = on_finished
        self.jobs: dict[int, Job] = {}
        self.order: list[int] = []
        self._runner: asyncio.Task | None = None
        self._wake = asyncio.Event()

    # Queries
    def status_of(self, rom_id: int) -> str | None:
        job = self.jobs.get(rom_id)
        return job.status if job and job.status in ACTIVE else None

    def job_for_appid(self, appid: int) -> Job | None:
        return next((j for j in self.jobs.values() if j.appid == appid and j.status in ACTIVE), None)

    def snapshot(self) -> dict:
        active = next((j.progress() for j in self.jobs.values() if j.status == "downloading"), None)
        live = [i for i in self.order if self.jobs[i].status in ACTIVE]
        items = [self.jobs[i].view(idx) for idx, i in enumerate(live)]
        items += [j.view(-1) for j in self.jobs.values() if j.status == "done"]
        return {"active": active, "queue": [i for i in live if self.jobs[i].status != "downloading"],
                "items": items, "roms_dir": self.location.roms_dir}

    # Commands
    def add(self, game: Game, appid: int = 0) -> None:
        job = self.jobs.get(game.rom_id)
        if job and job.status in ACTIVE:
            if appid and not job.appid:
                job.appid = appid
            return
        self.jobs[game.rom_id] = Job(game, appid=appid)
        if game.rom_id in self.order:
            self.order.remove(game.rom_id)
        self.order.append(game.rom_id)
        self._kick()

    def add_appid(self, rom_id: int, appid: int) -> None:
        job = self.jobs.get(rom_id)
        if job:
            job.appid = appid

    async def cancel(self, rom_id: int) -> None:
        job = self.jobs.get(rom_id)
        if not job or job.status not in ACTIVE:
            return
        if job.status == "downloading" and job.task:
            job.task.cancel()
            return  # the runner reports it
        job.status = "cancelled"
        self.order.remove(rom_id)
        await self.on_finished(job)

    async def pause(self, rom_id: int) -> None:
        job = self.jobs.get(rom_id)
        if not job or job.status not in ("queued", "downloading"):
            return
        job.status = "paused"
        if job.task:
            job.task.cancel()  # the runner sees "paused" and keeps the job
        else:
            await self.on_finished(job)

    async def resume(self, rom_id: int) -> None:
        job = self.jobs.get(rom_id)
        if not job or job.status != "paused":
            return
        job.status = "queued"
        self._kick()
        await self.on_finished(job)

    async def pause_all(self) -> None:
        for i in list(self.order):
            await self.pause(i)

    async def resume_all(self) -> None:
        for i in list(self.order):
            await self.resume(i)

    def move(self, rom_id: int, delta: int) -> None:
        pending = [i for i in self.order if self.jobs[i].status in ("queued", "paused")]
        if rom_id not in pending:
            return
        pending.remove(rom_id)
        pos = max(0, min(len(pending), pending.index(rom_id) + delta if rom_id in pending else 0))
        self.move_to(rom_id, pos)

    def move_to(self, rom_id: int, index: int) -> None:
        pending = [i for i in self.order if self.jobs[i].status in ("queued", "paused")]
        if rom_id not in pending:
            return
        pending.remove(rom_id)
        pending.insert(max(0, min(len(pending), index)), rom_id)
        rest = [i for i in self.order if self.jobs[i].status not in ("queued", "paused")]
        self.order = rest + pending

    def forget(self, rom_id: int) -> None:
        """Drops a finished job (its Steam shortcut is about to go away, so the Downloads page must not list it)."""
        job = self.jobs.get(rom_id)
        if job and job.status not in ACTIVE:
            del self.jobs[rom_id]
            if rom_id in self.order:
                self.order.remove(rom_id)

    def clear(self) -> None:
        for rom_id in [i for i, j in self.jobs.items() if j.status not in ACTIVE]:
            del self.jobs[rom_id]
            if rom_id in self.order:
                self.order.remove(rom_id)

    async def stop(self) -> None:
        if self._runner and not self._runner.done():
            self._runner.cancel()
        for job in self.jobs.values():
            if job.task and not job.task.done():
                job.task.cancel()

    # The runner
    def _kick(self) -> None:
        self._wake.set()
        if not self._runner or self._runner.done():
            self._runner = asyncio.create_task(self._run())

    async def _run(self) -> None:
        while True:
            self._wake.clear()
            rom_id = next((i for i in self.order if self.jobs[i].status == "queued"), None)
            if rom_id is None:
                if any(self.jobs[i].status == "paused" for i in self.order):
                    await self._wake.wait()  # a resume will wake us
                    continue
                return
            job = self.jobs[rom_id]
            job.status = "downloading"
            job.started_at = job.started_at or time.time()
            job.task = asyncio.create_task(self._download(job))
            try:
                await job.task
                job.status = "done"
                job.completed_at = time.time()
            except asyncio.CancelledError:
                if job.status != "paused":
                    job.status = "cancelled"
            except RommError as e:
                job.status, job.error = "failed", f"RomM answered {e.status}"
            except Exception as e:
                job.status, job.error = "failed", str(e)
            job.task = None
            job.bps = 0
            if job.status not in ACTIVE and rom_id in self.order and job.status != "done":
                self.order.remove(rom_id)
            self.on_progress(job.progress())
            await self.on_finished(job)

    async def _download(self, job: Job) -> None:
        rom = await self.client.rom(job.game.rom_id)
        files = [f for f in rom.get("files", []) if f.get("category") in GAME_FILE_CATEGORIES]
        if not files:
            raise RuntimeError("RomM lists no game files for this title")
        target = self.location.target(job.game.slug, job.game.fs_name, job.game.single_file)
        job.total_bytes = sum(f.get("file_size_bytes", 0) for f in files)
        prefix = f"{rom.get('fs_path', '')}/{rom['fs_name']}".strip("/")
        plan = []
        for f in files:
            if target.is_dir:
                rel = f.get("file_path", "").strip("/")
                rel = rel[len(prefix):].strip("/") if rel.startswith(prefix) else ""
                dest = os.path.join(target.path, rel, f["file_name"])
            else:
                dest = target.path
            plan.append((f, dest))
        completed = 0
        for f, dest in plan:
            if os.path.isfile(dest) and os.path.getsize(dest) == f.get("file_size_bytes", -1):
                completed += f.get("file_size_bytes", 0)
                job.done_bytes = completed
                continue
            await self._fetch(job, f, dest, completed)
            completed += f.get("file_size_bytes", 0)

    async def _fetch(self, job: Job, f: dict, dest: str, completed: int) -> None:
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        part = dest + ".part"
        start = os.path.getsize(part) if os.path.isfile(part) else 0
        async with self.client.content(job.game.rom_id, f["id"], f["file_name"], start) as r:
            if r.status == 416:  # the .part is already complete
                os.replace(part, dest)
                return
            if r.status >= 400:
                raise RommError(r.status, (await r.text())[:200])
            resumed = r.status == 206
            job.done_bytes = completed + (start if resumed else 0)
            last = time.monotonic()
            job._rate_from = (last, job.done_bytes)
            with open(part, "ab" if resumed else "wb") as out:
                async for chunk in r.content.iter_chunked(CHUNK):
                    out.write(chunk)
                    job.done_bytes += len(chunk)
                    now = time.monotonic()
                    if now - last >= PROGRESS_EVERY_S:
                        t0, b0 = job._rate_from
                        job.bps = (job.done_bytes - b0) / (now - t0) if now > t0 else 0
                        job._rate_from = (now, job.done_bytes)
                        self.on_progress(job.progress())
                        last = now
        os.replace(part, dest)
