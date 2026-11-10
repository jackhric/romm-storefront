import pytest

from chickentender.video import VideoResolver, expires_at, pick_audio, pick_stream

FORMATS = [
    {"format_id": "18", "url": "u18", "ext": "mp4", "vcodec": "avc1.42001E", "acodec": "mp4a.40.2", "protocol": "https", "height": 360},
    {"format_id": "134", "url": "u134", "ext": "mp4", "vcodec": "avc1.4D401E", "acodec": "none", "protocol": "https", "height": 360},
    {"format_id": "136", "url": "u136", "ext": "mp4", "vcodec": "avc1.64001F", "acodec": "none", "protocol": "https", "height": 720},
    {"format_id": "137", "url": "u137", "ext": "mp4", "vcodec": "avc1.640028", "acodec": "none", "protocol": "https", "height": 1080},
    {"format_id": "247", "url": "u247", "ext": "webm", "vcodec": "vp9", "acodec": "none", "protocol": "https", "height": 720},
    {"format_id": "139", "url": "a139", "ext": "m4a", "vcodec": "none", "acodec": "mp4a.40.5", "protocol": "https", "abr": 48},
    {"format_id": "140", "url": "a140", "ext": "m4a", "vcodec": "none", "acodec": "mp4a.40.2", "protocol": "https", "abr": 129},
    {"format_id": "hls", "url": "m3u8", "ext": "mp4", "vcodec": "avc1.64001F", "acodec": "none", "protocol": "m3u8_native", "height": 720},
]


def test_pick_stream_prefers_silent_h264_within_the_height():
    assert pick_stream(FORMATS, 360) == "u134"
    assert pick_stream(FORMATS, 720) == "u136"
    assert pick_stream(FORMATS, 240) == "u18"  # nothing fits: the smallest there is
    assert pick_stream([FORMATS[4], FORMATS[5]], 720) == ""


def test_pick_audio_takes_the_best_aac_track():
    assert pick_audio(FORMATS) == "a140"
    assert pick_audio(FORMATS[:4]) == ""


def test_expires_at_reads_the_stream_address():
    assert expires_at("https://x/videoplayback?expire=5000&id=1", 100) == 5000
    assert expires_at("https://x/videoplayback", 100) > 100


async def test_resolve_caches_until_the_address_lapses():
    calls, now = [], [1000.0]

    def extract(video_id):
        calls.append(video_id)
        return {"formats": [dict(f, url=f"{f['url']}?expire=9000") for f in FORMATS]}

    r = VideoResolver(extract, lambda: now[0])
    first = await r.resolve("abcDEF12345")
    assert first == {"small": "u134?expire=9000", "large": "u136?expire=9000", "audio": "a140?expire=9000"}
    assert await r.resolve("abcDEF12345") == first and calls == ["abcDEF12345"]
    now[0] = 8500.0  # inside the margin before expiry
    await r.resolve("abcDEF12345")
    assert len(calls) == 2


async def test_resolve_never_raises():
    def extract(_):
        raise RuntimeError("blocked")

    r = VideoResolver(extract)
    nothing = {"small": "", "large": "", "audio": ""}
    assert await r.resolve("abcDEF12345") == nothing
    assert await r.resolve("") == nothing
    assert await r.resolve("not a valid id!") == nothing
