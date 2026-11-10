import json
import os

from chickentender import retrodeck


def test_detect_reads_roms_path_and_lock(tmp_path, monkeypatch):
    monkeypatch.setattr(retrodeck.shutil, "which", lambda _: None)  # no flatpak on the test box
    assert retrodeck.detect(str(tmp_path)) == retrodeck.RetroDeck(False, False, "", "")
    cfg = retrodeck.config_dir(str(tmp_path))
    os.makedirs(cfg)
    with open(os.path.join(cfg, "retrodeck.json"), "w") as f:
        json.dump({"version": "0.10.9b", "paths": {"roms_path": "/r/roms"}}, f)
    assert retrodeck.detect(str(tmp_path)) == retrodeck.RetroDeck(False, False, "0.10.9b", "/r/roms")
    open(os.path.join(cfg, ".lock"), "w").close()
    assert retrodeck.detect(str(tmp_path)).initialised
