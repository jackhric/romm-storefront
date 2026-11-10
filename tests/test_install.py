import os

from chickentender.install import InstallLocation


def test_platform_dir_prefers_esde_spelling_when_it_exists(tmp_path):
    os.makedirs(tmp_path / "gc")
    loc = InstallLocation(str(tmp_path), "/home/x")
    assert loc.platform_dir("ngc") == str(tmp_path / "gc")
    assert loc.platform_dir("psx") == str(tmp_path / "psx")  # missing dirs fall back to the slug


def test_target_status(tmp_path):
    loc = InstallLocation(str(tmp_path), "/home/x")
    single = loc.target("nes", "Contra (USA).nes", single_file=True)
    assert not single.installed and not single.partial
    os.makedirs(loc.platform_dir("nes"))
    open(single.path + ".part", "wb").close()
    assert single.partial and not single.installed
    os.replace(single.path + ".part", single.path)
    assert single.installed

    multi = loc.target("psx", "Game (USA)", single_file=False)
    assert multi.is_dir and not multi.installed
    os.makedirs(multi.path)
    open(os.path.join(multi.path, "Track 1.bin.part"), "wb").close()
    assert multi.partial and not multi.installed
    open(os.path.join(multi.path, "Game (USA).cue"), "wb").close()
    assert multi.installed


def test_tilde_expands_to_the_given_home():
    assert InstallLocation("~/retrodeck/roms", "/home/user").roms_dir == "/home/user/retrodeck/roms"


def test_launch_file_prefers_playlist_then_cue(tmp_path):
    from chickentender.install import launch_file
    loc = InstallLocation(str(tmp_path), "/home/x")
    t = loc.target("psx", "G (USA)", single_file=False)
    os.makedirs(t.path)
    for n in ("G (USA) (Track 1).bin", "G (USA).cue", "G (USA) (Track 2).bin.part"):
        open(os.path.join(t.path, n), "wb").write(b"x" * (10 if n.endswith(".bin") else 1))
    assert launch_file(t) == os.path.join(t.path, "G (USA).cue")
    open(os.path.join(t.path, "G.m3u"), "wb").close()
    assert launch_file(t) == os.path.join(t.path, "G.m3u")
    assert launch_file(loc.target("nes", "a.nes", single_file=True)) == os.path.join(loc.platform_dir("nes"), "a.nes")

