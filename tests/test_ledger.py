import asyncio
import logging
import os

import pytest

from chickentender import ledger as L
from chickentender.app import App
from chickentender.downloads import Downloader
from chickentender.install import InstallLocation
from chickentender.ledger import Install, Ledger
from chickentender.library import Game
from test_downloads import FakeClient, FakeResponse

MULTI = {"fs_path": "roms/psx", "fs_name": "G (USA)", "files": [
    {"id": 1, "file_name": "G (USA).cue", "file_path": "roms/psx/G (USA)", "file_size_bytes": 3, "category": "game"},
    {"id": 2, "file_name": "Track 1.bin", "file_path": "roms/psx/G (USA)/data", "file_size_bytes": 7, "category": "game"},
]}
BLOBS = {1: b"cue", 2: b"binbinb"}
GAME = Game(rom_id=1, name="G", platform_id=1, platform="P", slug="psx", fs_name="G (USA)", single_file=False, size_bytes=10, cover="")


class SlowClient(FakeClient):
    """One byte every 10 ms, so a test can interrupt a download."""

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


async def _noop(*a):
    pass


async def settle(d: Downloader, rom_id: int = 1, want: str = "done"):
    for _ in range(300):
        await asyncio.sleep(0.01)
        if d.jobs.get(rom_id) and d.jobs[rom_id].status == want:
            return
    raise AssertionError(f"job is {d.jobs[rom_id].status if rom_id in d.jobs else 'gone'}, wanted {want}")


def test_records_survive_a_reload_and_changes_are_on_disk_at_once(tmp_path):
    path = str(tmp_path / "installs.json")
    led = Ledger(path)
    led.put(Install(rom_id=7, name="G", slug="psx", fs_name="G.bin", single_file=True, size_bytes=10))
    led.update(7, state=L.FAILED, error="disk full", files=[{"path": "", "size": 10}])
    again = Ledger(path).get(7)
    assert again.state == L.FAILED and again.error == "disk full" and again.files == [{"path": "", "size": 10}]
    led.update(7, state=L.QUEUED)
    assert Ledger(path).get(7).error == ""  # an error belongs to the failure it came with
    with pytest.raises(ValueError):
        led.update(7, state="nonsense")
    assert Ledger(path).get(7).state == L.QUEUED
    led.remove(7)
    assert Ledger(path).all() == []


def test_an_unreadable_ledger_is_set_aside_not_trusted(tmp_path):
    path = tmp_path / "installs.json"
    path.write_text('{"version": 1, "installs": [{"rom_id": 1, "na')
    led = Ledger(str(path))
    assert led.all() == [] and (tmp_path / "installs.json.unreadable").exists()
    led.put(Install(rom_id=1, name="G", slug="psx", fs_name="G.bin", single_file=True))
    assert Ledger(str(path)).get(1)


def test_check_wants_every_listed_file_at_its_full_size(tmp_path):
    install = Install(rom_id=1, name="G", slug="psx", fs_name="G", single_file=False,
                      files=[{"path": "a.cue", "size": 3}, {"path": "data/b.bin", "size": 7}])
    folder = tmp_path / "G"
    assert not L.check(install, str(folder)).complete
    os.makedirs(folder / "data")
    (folder / "a.cue").write_bytes(b"cue")
    # The state the old "any finished file" rule called installed.
    seen = L.check(install, str(folder))
    assert not seen.complete and seen.missing == ("data/b.bin",) and seen.done_bytes == 3 and seen.total_bytes == 10
    (folder / "data" / "b.bin.part").write_bytes(b"bin")
    assert L.check(install, str(folder)).done_bytes == 6
    (folder / "data" / "b.bin").write_bytes(b"short")
    assert not L.check(install, str(folder)).complete
    (folder / "data" / "b.bin").write_bytes(b"binbinb")
    assert L.check(install, str(folder)).complete
    assert not L.check(Install(rom_id=2, name="H", slug="psx", fs_name="H", single_file=False), str(folder)).complete


@pytest.mark.asyncio
async def test_a_download_cut_off_by_a_restart_continues_afterwards(tmp_path):
    path, loc = str(tmp_path / "installs.json"), InstallLocation(str(tmp_path / "roms"), "/h")
    first = Downloader(SlowClient(MULTI, BLOBS), loc, lambda p: None, _noop, Ledger(path))
    first.add(GAME, appid=42)
    await asyncio.sleep(0.06)  # the .cue is done, the .bin is under way
    await first.stop()
    await asyncio.sleep(0.02)
    assert Ledger(path).get(1).state == L.DOWNLOADING
    assert Ledger(path).get(1).files == [{"path": "G (USA).cue", "size": 3}, {"path": "data/Track 1.bin", "size": 7}]

    client = FakeClient(MULTI, BLOBS)
    second = Downloader(client, loc, lambda p: None, _noop, Ledger(path))
    second.restore(lambda rom_id: 42)
    await settle(second)
    assert second.jobs[1].appid == 42 and client.starts[0] > 0  # resumed, not started over
    assert (tmp_path / "roms" / "psx" / "G (USA)" / "data" / "Track 1.bin").read_bytes() == b"binbinb"
    assert Ledger(path).get(1).state == L.INSTALLED


@pytest.mark.asyncio
async def test_a_paused_download_is_still_paused_after_a_restart(tmp_path):
    path, loc = str(tmp_path / "installs.json"), InstallLocation(str(tmp_path / "roms"), "/h")
    first = Downloader(SlowClient(MULTI, BLOBS), loc, lambda p: None, _noop, Ledger(path))
    first.add(GAME)
    await asyncio.sleep(0.06)
    await first.pause(1)
    await asyncio.sleep(0.02)
    await first.stop()

    second = Downloader(FakeClient(MULTI, BLOBS), loc, lambda p: None, _noop, Ledger(path))
    second.restore()
    await asyncio.sleep(0.05)
    job = second.jobs[1]
    assert job.status == "paused" and 0 < job.done_bytes < 10 and job.total_bytes == 10
    second.add(GAME)  # Resume in the store is a download request
    await settle(second)
    assert Ledger(path).get(1).state == L.INSTALLED


@pytest.mark.asyncio
async def test_stopping_and_failing_leave_a_record_that_says_so(tmp_path):
    loc = InstallLocation(str(tmp_path / "roms"), "/h")
    led = Ledger()
    d = Downloader(SlowClient(MULTI, BLOBS), loc, lambda p: None, _noop, led)
    d.add(GAME)
    await asyncio.sleep(0.06)
    await d.cancel(1)
    await asyncio.sleep(0.03)
    assert led.get(1).state == L.INCOMPLETE and (tmp_path / "roms" / "psx" / "G (USA)" / "G (USA).cue").exists()

    class Broken(FakeClient):
        def content(self, *a, **k):
            raise RuntimeError("connection reset")
    d = Downloader(Broken(MULTI, BLOBS), loc, lambda p: None, _noop, led)
    d.add(GAME)
    await settle(d, want="failed")
    assert led.get(1).state == L.FAILED and led.get(1).error == "connection reset"


@pytest.mark.asyncio
async def test_a_download_that_ends_short_is_not_installed(tmp_path):
    led = Ledger()
    d = Downloader(FakeClient(MULTI, {1: b"cue", 2: b"bin"}), InstallLocation(str(tmp_path), "/h"), lambda p: None, _noop, led)
    d.add(GAME)
    await settle(d, want="failed")
    assert led.get(1).state == L.FAILED and "data/Track 1.bin" in led.get(1).error


def app_with(tmp_path, client) -> App:
    app = App(str(tmp_path / "settings.json"), "1", str(tmp_path), _noop, logging.getLogger("t"))
    app.location = InstallLocation(str(tmp_path / "roms"), str(tmp_path))
    app.client = client
    app.library.games = {1: GAME}
    return app


@pytest.mark.asyncio
async def test_games_found_on_disk_are_checked_against_romm_and_adopted(tmp_path):
    folder = tmp_path / "roms" / "psx" / "G (USA)"
    os.makedirs(folder)
    (folder / "G (USA).cue").write_bytes(b"cue")
    app = app_with(tmp_path, FakeClient(MULTI, BLOBS))
    assert app.status(1) == "available"
    await app.adopt()
    assert app.status(1) == L.INCOMPLETE and app.installs()[0]["missing"] == ["data/Track 1.bin"]
    assert app.installed() == []

    os.makedirs(folder / "data")
    (folder / "data" / "Track 1.bin").write_bytes(b"binbinb")
    await app.verify(1)
    assert app.status(1) == L.INSTALLED
    app.shortcuts.set(1, 42, "G")
    assert [(g["appid"], g["bytes"]) for g in app.installed()] == [(42, 10)]

    os.unlink(folder / "G (USA).cue")  # files deleted behind our back
    assert app.status(1) == L.INCOMPLETE and app.installed() == []


@pytest.mark.asyncio
async def test_remove_clears_files_record_and_shortcut_in_any_state(tmp_path):
    folder = tmp_path / "roms" / "psx" / "G (USA)"
    os.makedirs(folder)
    (folder / "G (USA).cue").write_bytes(b"cue")
    app = app_with(tmp_path, FakeClient(MULTI, BLOBS))
    await app.adopt()
    app.shortcuts.set(1, 42, "G")
    app.library.games = {}  # the game left RomM; its record is enough to remove it
    out = await app.remove(1)
    assert out["removed"] == 42 and not folder.exists() and app.ledger.get(1) is None and out["installs"] == []


@pytest.mark.asyncio
async def test_steams_resume_restarts_a_download_that_had_stopped(tmp_path):
    folder = tmp_path / "roms" / "psx" / "G (USA)"
    os.makedirs(folder)
    (folder / "G (USA).cue").write_bytes(b"cue")
    app = app_with(tmp_path, FakeClient(MULTI, BLOBS))
    app._start_paired()
    app._refresh_task.cancel()
    await app.adopt()
    app.shortcuts.set(1, 42, "G")
    assert app.status(1) == L.INCOMPLETE
    await app.download_control("resume", 42)
    await settle(app.downloader)
    assert app.status(1) == L.INSTALLED and app.downloader.jobs[1].appid == 42
