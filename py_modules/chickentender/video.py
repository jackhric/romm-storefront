"""Direct video streams for a game's trailer, so the store plays a plain video file rather than YouTube's player.

yt-dlp does the extraction (in a thread: it blocks). The stream addresses expire and are tied to this machine's IP, so
they are resolved here on the device and cached only until shortly before they lapse.
"""
import asyncio
import json
import os
import re
import shutil
import subprocess
import time
from collections.abc import Callable
from typing import Any
from urllib.parse import parse_qs, urlsplit

SMALL_HEIGHT = 360
LARGE_HEIGHT = 720
DEFAULT_TTL_S = 3 * 3600
EXPIRY_MARGIN_S = 600
RETRY_AFTER_FAILURE_S = 900
VALID_ID = re.compile(r"^[A-Za-z0-9_-]{6,20}$")


# Runs under the system's Python: Decky's bundled interpreter ships without parts of the standard library that
# yt-dlp imports (xml.etree).
_SCRIPT = """
import json, sys, yt_dlp
options = {"quiet": True, "no_warnings": True, "noplaylist": True, "skip_download": True, "socket_timeout": 15}
with yt_dlp.YoutubeDL(options) as ydl:
    info = ydl.extract_info("https://www.youtube.com/watch?v=" + sys.argv[1], download=False)
keys = ("url", "ext", "vcodec", "acodec", "protocol", "height", "abr")
json.dump({"formats": [{k: f.get(k) for k in keys} for f in info.get("formats") or []]}, sys.stdout)
"""
_MODULES_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_LOADER_ENV = ("LD_LIBRARY_PATH", "PYTHONHOME", "PYTHONPATH")


def _extract(video_id: str) -> dict:
    python = shutil.which("python3", path="/usr/bin:/bin:/usr/local/bin")
    if not python:
        raise RuntimeError("no system python3")
    env = {k: v for k, v in os.environ.items() if k not in _LOADER_ENV}
    env["PYTHONPATH"] = _MODULES_DIR
    done = subprocess.run([python, "-c", _SCRIPT, video_id], capture_output=True, text=True, timeout=60, env=env)
    if done.returncode:
        raise RuntimeError((done.stderr.strip().splitlines() or ["yt-dlp failed"])[-1])
    return json.loads(done.stdout)


def pick_stream(formats: list[dict], max_height: int) -> str:
    """The best H.264 MP4 the Steam client plays as one plain file, no taller than max_height (else the smallest)."""
    usable = [f for f in formats
              if f.get("url") and f.get("ext") == "mp4" and str(f.get("vcodec") or "").startswith("avc1")
              and str(f.get("protocol") or "").startswith("http") and isinstance(f.get("height"), int)]
    if not usable:
        return ""
    fitting = [f for f in usable if f["height"] <= max_height]
    # Previews are muted, so a video-only stream is preferred at the same height: it is smaller.
    silent_first = lambda f: (f["height"], f.get("acodec") in (None, "none"))  # noqa: E731
    best = max(fitting, key=silent_first) if fitting else min(usable, key=lambda f: f["height"])
    return best["url"]


def pick_audio(formats: list[dict]) -> str:
    """The best plain AAC track: the video streams are silent, so sound is played alongside them."""
    usable = [f for f in formats
              if f.get("url") and f.get("ext") == "m4a" and f.get("vcodec") in (None, "none")
              and str(f.get("acodec") or "").startswith("mp4a") and str(f.get("protocol") or "").startswith("http")]
    return max(usable, key=lambda f: f.get("abr") or 0)["url"] if usable else ""


def expires_at(url: str, now: float) -> float:
    try:
        return float(parse_qs(urlsplit(url).query)["expire"][0])
    except (KeyError, ValueError, IndexError):
        return now + DEFAULT_TTL_S


class VideoResolver:
    def __init__(self, extract: Callable[[str], dict] = _extract, clock: Callable[[], float] = time.time, log: Any = None):
        self._extract = extract
        self._clock = clock
        self._log = log
        self._cache: dict[str, tuple[float, dict]] = {}
        self._pending: dict[str, asyncio.Task] = {}

    async def resolve(self, video_id: str) -> dict:
        """{"small": url, "large": url, "audio": url}; empty strings when the video cannot be resolved."""
        empty = {"small": "", "large": "", "audio": ""}
        if not VALID_ID.match(video_id or ""):
            return empty
        cached = self._cache.get(video_id)
        if cached and cached[0] > self._clock():
            return cached[1]
        task = self._pending.get(video_id)
        if not task:
            task = self._pending[video_id] = asyncio.ensure_future(self._resolve(video_id))
        try:
            return await asyncio.shield(task)
        finally:
            if task.done():
                self._pending.pop(video_id, None)

    async def _resolve(self, video_id: str) -> dict:
        now = self._clock()
        try:
            info = await asyncio.to_thread(self._extract, video_id)
            formats = info.get("formats") or []
            streams = {"small": pick_stream(formats, SMALL_HEIGHT), "large": pick_stream(formats, LARGE_HEIGHT), "audio": pick_audio(formats)}
        except Exception as e:  # yt-dlp raises many kinds; a preview is never worth an error
            if self._log:
                self._log.warning("video %s could not be resolved: %s: %s", video_id, type(e).__name__, str(e)[:200])
            streams = {"small": "", "large": "", "audio": ""}
        if streams["small"] or streams["large"]:
            until = min(expires_at(u, now) for u in streams.values() if u) - EXPIRY_MARGIN_S
        else:
            until = now + RETRY_AFTER_FAILURE_S
        self._cache[video_id] = (until, streams)
        return streams
