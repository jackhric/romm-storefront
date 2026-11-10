import base64
import logging

import pytest

from chickentender.app import App


async def _noop(*_args):
    pass


def test_icon_is_written_once_per_game_and_must_be_png(tmp_path):
    app = App(str(tmp_path / "settings.json"), "0", str(tmp_path), _noop, logging.getLogger("test"))
    app.runtime_dir = str(tmp_path / "runtime")
    png = b"\x89PNG\r\n\x1a\n" + b"x" * 10
    path = app.save_icon(7, base64.b64encode(png).decode())
    assert path == str(tmp_path / "runtime" / "icons" / "7.png")
    assert open(path, "rb").read() == png
    with pytest.raises(ValueError):
        app.save_icon(7, base64.b64encode(b"GIF89a").decode())
