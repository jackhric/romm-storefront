"""Just enough Chrome DevTools to read and steer a page of Steam's built-in browser (Decky keeps CEF debugging on 8080)."""
import json
from typing import Any

import aiohttp

UNAVAILABLE = "Steam's browser debugging is not available"


class CdpError(Exception):
    pass


async def list_pages(port: int = 8080) -> list[dict]:
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5)) as s:
            async with s.get(f"http://127.0.0.1:{port}/json") as r:
                targets = await r.json(content_type=None)
    except (aiohttp.ClientError, OSError, TimeoutError, ValueError) as e:
        raise ConnectionError(UNAVAILABLE) from e
    return [t for t in targets if isinstance(t, dict) and t.get("type") == "page"]


async def evaluate(ws_url: str, expression: str, timeout: float = 10.0) -> Any:
    """The value of `expression` in the page; one websocket per call, so a navigation in between cannot wedge it."""
    params = {"expression": expression, "returnByValue": True, "awaitPromise": True}
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=timeout)) as s:
            async with s.ws_connect(ws_url, max_msg_size=0) as ws:
                await ws.send_str(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": params}))
                async for msg in ws:
                    if msg.type != aiohttp.WSMsgType.TEXT:
                        break
                    reply = json.loads(msg.data)
                    if reply.get("id") != 1:
                        continue
                    if "error" in reply:
                        raise CdpError(str(reply["error"].get("message", "CDP error")))
                    result = reply.get("result") or {}
                    if "exceptionDetails" in result:
                        # Only the exception's headline: its description could quote page text.
                        raise CdpError(str(result["exceptionDetails"].get("text", "exception")))
                    return (result.get("result") or {}).get("value")
    except (aiohttp.ClientError, OSError, TimeoutError) as e:
        raise ConnectionError(UNAVAILABLE) from e
    raise CdpError("The page closed the connection")
