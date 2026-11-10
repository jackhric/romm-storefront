import asyncio
import os

import pytest

from chickentender.downloads import Downloader
from chickentender.install import InstallLocation
from chickentender.library import Game


class FakeResponse:
    def __init__(self, data: bytes, start: int):
        self.status = 206 if start else 200
        self._data = data[start:]
        self.content = self

    async def iter_chunked(self, n):
        for i in range(0, len(self._data), n):
            await asyncio.sleep(0)
            yield self._data[i:i + n]

    async def text(self):
        return ""

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


class FakeClient:
    def __init__(self, rom: dict, blobs: dict[int, bytes]):
        self._rom, self._blobs, self.starts = rom, blobs, []

    async def rom(self, rom_id):
        return self._rom

    def content(self, rom_id, file_id, file_name, start=0):
        self.starts.append(start)
        return FakeResponse(self._blobs[file_id], start)


def game(single: bool) -> Game:
    return Game(rom_id=1, name="G", platform_id=1, platform="P", slug="psx", fs_name="G (USA)" if not single else "G (USA).bin",
                single_file=single, size_bytes=10, cover="")


async def run(downloader: Downloader, g: Game):
    done = asyncio.Event()

    async def finished(job):
        done.set()
    downloader.on_finished = finished
    downloader.add(g)
    await asyncio.wait_for(done.wait(), 5)
    return downloader.jobs[g.rom_id]


@pytest.mark.asyncio
async def test_multi_file_game_lands_in_its_folder(tmp_path):
    rom = {"fs_path": "roms/psx", "fs_name": "G (USA)", "files": [
        {"id": 1, "file_name": "G (USA).cue", "file_path": "roms/psx/G (USA)", "file_size_bytes": 3, "category": "game"},
        {"id": 2, "file_name": "G (USA).bin", "file_path": "roms/psx/G (USA)", "file_size_bytes": 7, "category": "game"},
        {"id": 3, "file_name": "manual.pdf", "file_path": "roms/psx/G (USA)", "file_size_bytes": 9, "category": "manual"},
    ]}
    client = FakeClient(rom, {1: b"cue", 2: b"binbinb"})
    progress = []
    d = Downloader(client, InstallLocation(str(tmp_path), "/h"), progress.append, None)
    job = await run(d, game(single=False))
    assert job.status == "done" and job.done_bytes == 10 and job.total_bytes == 10
    folder = tmp_path / "psx" / "G (USA)"
    assert sorted(os.listdir(folder)) == ["G (USA).bin", "G (USA).cue"]
    assert (folder / "G (USA).bin").read_bytes() == b"binbinb"


@pytest.mark.asyncio
async def test_single_file_resumes_from_part(tmp_path):
    rom = {"fs_path": "roms/psx", "fs_name": "G (USA).bin", "files": [
        {"id": 1, "file_name": "G (USA).bin", "file_path": "roms/psx", "file_size_bytes": 10, "category": "game"}]}
    os.makedirs(tmp_path / "psx")
    (tmp_path / "psx" / "G (USA).bin.part").write_bytes(b"0123")
    client = FakeClient(rom, {1: b"0123456789"})
    d = Downloader(client, InstallLocation(str(tmp_path), "/h"), lambda p: None, None)
    job = await run(d, game(single=True))
    assert job.status == "done" and client.starts == [4]
    assert (tmp_path / "psx" / "G (USA).bin").read_bytes() == b"0123456789"
    assert not (tmp_path / "psx" / "G (USA).bin.part").exists()


@pytest.mark.asyncio
async def test_pause_keeps_the_job_and_resume_finishes_it(tmp_path):
    rom = {"fs_path": "roms/psx", "fs_name": "G (USA).bin", "files": [
        {"id": 1, "file_name": "G (USA).bin", "file_path": "roms/psx", "file_size_bytes": 10, "category": "game"}]}

    class SlowClient(FakeClient):
        def content(self, rom_id, file_id, file_name, start=0):
            self.starts.append(start)
            r = FakeResponse(self._blobs[file_id], start)
            chunks = r.iter_chunked

            async def slow(n):
                async for c in chunks(1):
                    await asyncio.sleep(0.01)
                    yield c
            r.iter_chunked = slow
            return r

    client = SlowClient(rom, {1: b"0123456789"})
    events = []

    async def finished(job):
        events.append(job.status)
    d = Downloader(client, InstallLocation(str(tmp_path), "/h"), lambda p: None, finished)
    d.add(game(single=True), appid=42)
    await asyncio.sleep(0.03)
    await d.pause(1)
    await asyncio.sleep(0.02)
    assert d.jobs[1].status == "paused" and events[-1] == "paused"
    assert d.snapshot()["items"][0]["state"] == "paused" and d.snapshot()["items"][0]["appid"] == 42
    await d.resume(1)
    for _ in range(100):
        await asyncio.sleep(0.01)
        if d.jobs[1].status == "done":
            break
    assert d.jobs[1].status == "done" and client.starts[0] == 0 and client.starts[1] > 0
    assert (tmp_path / "psx" / "G (USA).bin").read_bytes() == b"0123456789"
