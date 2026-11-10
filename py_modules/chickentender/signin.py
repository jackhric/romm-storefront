"""Sign in with Steam: fetches the user's SteamGridDB API key through Steam's own browser.

The frontend opens SteamGridDB's home page (`/externalweb`); this task follows that page over CDP and calls
SteamGridDB's JSON API from inside it, so the request carries the page's session cookie. Logged out, it sends the
page to Steam's OpenID login and waits for the user to press Sign In there. The key goes only to `submit`: never
into the state, a log line or an error.
"""
import asyncio
import logging
import re
import time
from collections.abc import Awaitable, Callable
from typing import Any
from urllib.parse import urlsplit

from . import cdp

HOME_URL = "https://www.steamgriddb.com/"
OPENID_URL = ("https://steamcommunity.com/openid/login?openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0"
              "&openid.mode=checkid_setup"
              "&openid.identity=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select"
              "&openid.claimed_id=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select"
              "&openid.realm=https%3A%2F%2Fwww.steamgriddb.com"
              "&openid.return_to=https%3A%2F%2Fwww.steamgriddb.com%2Flogin%2Fsteam")
POLL_S = 1.0
TIMEOUT_S = 300.0
RENAVIGATE_S = 5.0
MAX_LOGINS = 3
MAX_LIST_FAILURES = 5
KEY_RE = re.compile(r"[0-9a-f]{32}")

STAGES = ("opening", "login", "consent", "reading", "verifying", "done", "failed")

JS_PREFS = """(async () => {
  const r = await fetch('/api/public/prefs', { credentials: 'include', headers: { Accept: 'application/json' } });
  let body = null;
  try { body = await r.json(); } catch (e) {}
  const user = body && body.success && body.data && body.data.user;
  if (!user) return { status: r.status, loggedIn: false };
  return { status: r.status, loggedIn: true, key: typeof user.api_key === 'string' ? user.api_key : null };
})()"""

# The site's axios client sends the XSRF-TOKEN cookie back as a header; do the same when it is there.
JS_CREATE = """(async () => {
  const m = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]*)/);
  const headers = { Accept: 'application/json' };
  if (m) headers['X-XSRF-TOKEN'] = decodeURIComponent(m[1]);
  const r = await fetch('/api/v2/users/apikey', { method: 'POST', credentials: 'include', headers });
  let body = null;
  try { body = await r.json(); } catch (e) {}
  return { status: r.status, key: body && typeof body.data === 'string' ? body.data : null };
})()"""

JS_GOTO = "(() => { location.href = %s; return true; })()"


def _where(url: str) -> str:
    """'sgdb', 'callback' (SteamGridDB finishing the OpenID login), 'consent' or '' for a page of no interest."""
    u = urlsplit(url or "")
    host, path = (u.hostname or "").lower(), u.path
    if host in ("steamgriddb.com", "www.steamgriddb.com"):
        return "callback" if path.startswith("/login/") else "sgdb"
    if host == "steamcommunity.com" and path.startswith("/openid"):
        return "consent"
    return ""


def _valid(key: Any) -> bool:
    return isinstance(key, str) and KEY_RE.fullmatch(key) is not None


class SgdbSignin:
    def __init__(self, submit: Callable[[str], Awaitable[str]], changed: Callable[[], None], logger: logging.Logger,
                 list_pages: Callable[[], Awaitable[list[dict]]] = cdp.list_pages,
                 evaluate: Callable[[str, str], Awaitable[Any]] = cdp.evaluate,
                 sleep: Callable[[float], Awaitable[None]] = asyncio.sleep, clock: Callable[[], float] = time.monotonic,
                 timeout_s: float = TIMEOUT_S):
        self._submit = submit
        self._changed = changed
        self.log = logger
        self._list_pages = list_pages
        self._evaluate = evaluate
        self._sleep = sleep
        self._clock = clock
        self._timeout_s = timeout_s
        self.stage = ""
        self.error = ""
        self.task: asyncio.Task | None = None
        self._reset()

    def _reset(self) -> None:
        self._target_id = ""
        self._seen = False
        self._list_failures = 0
        self._last_login = -1e9
        self._logins = 0
        self._created = False

    @property
    def active(self) -> bool:
        return self.task is not None and not self.task.done()

    def as_dict(self) -> dict:
        return {"active": self.active, "stage": self.stage, "error": self.error}

    def start(self) -> None:
        if self.active:
            return
        self._reset()
        self.stage, self.error = "opening", ""
        self.task = asyncio.create_task(self._run())
        self._changed()

    async def cancel(self) -> None:
        if self.task and not self.task.done():
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
        self.task = None
        self.stage, self.error = "", ""
        self._changed()

    def _set(self, stage: str, error: str = "") -> None:
        if stage != self.stage or error != self.error:
            self.stage, self.error = stage, error
            self.log.info("SteamGridDB sign-in: %s%s", stage, f" ({error})" if error else "")
            self._changed()

    async def _run(self) -> None:
        deadline = self._clock() + self._timeout_s
        try:
            while not await self.step():
                if self._clock() >= deadline:
                    self._set("failed", "Timed out waiting for SteamGridDB")
                    return
                await self._sleep(POLL_S)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            # The type only: a message could quote what the page returned.
            self.log.warning("SteamGridDB sign-in stopped: %s", type(e).__name__)
            self._set("failed", "Sign-in stopped unexpectedly")

    def _pick(self, pages: list[dict]) -> dict | None:
        for p in pages:
            if self._target_id and p.get("id") == self._target_id:
                return p
        return next((p for p in pages if _where(p.get("url", ""))), None)

    async def _eval(self, page: dict, expression: str) -> Any:
        """None when the page is mid-navigation or otherwise does not answer this time."""
        try:
            return await self._evaluate(page["webSocketDebuggerUrl"], expression)
        except (ConnectionError, cdp.CdpError, KeyError, TimeoutError):
            return None

    async def _finish(self, key: str) -> bool:
        self._set("verifying")
        error = await self._submit(key)
        self._set("failed", error) if error else self._set("done")
        return True

    async def step(self) -> bool:
        """One poll; True once the flow is over (done or failed)."""
        try:
            pages = await self._list_pages()
            self._list_failures = 0
        except ConnectionError as e:
            self._list_failures += 1
            if self._list_failures >= MAX_LIST_FAILURES or not self._seen:
                self._set("failed", str(e) or cdp.UNAVAILABLE)
                return True
            return False
        page = self._pick(pages)
        if page is None:
            if self._seen:
                self._set("failed", "The browser was closed")
                return True
            self._set("opening")
            return False
        self._seen = True
        self._target_id = page.get("id", "")
        where = _where(page.get("url", ""))
        if where == "consent":
            self._set("consent")
            return False
        if where not in ("sgdb", "callback"):
            return False
        prefs = await self._eval(page, JS_PREFS)
        if not isinstance(prefs, dict):
            return False
        if not prefs.get("loggedIn"):
            if where == "callback" or prefs.get("status") not in (200, 401, 403):
                return False
            if self._logins >= MAX_LOGINS:
                self._set("failed", "SteamGridDB did not sign you in")
                return True
            self._set("login")
            if self._clock() - self._last_login >= RENAVIGATE_S:
                self._last_login = self._clock()
                self._logins += 1
                await self._eval(page, JS_GOTO % f'"{OPENID_URL}"')
            return False
        self._set("reading")
        if _valid(prefs.get("key")):
            return await self._finish(prefs["key"])
        if prefs.get("key") is None and not self._created:
            # Only for an account without a key; an existing key is never replaced.
            self._created = True
            made = await self._eval(page, JS_CREATE)
            if isinstance(made, dict) and _valid(made.get("key")):
                return await self._finish(made["key"])
            return False
        self._set("failed", "SteamGridDB did not give an API key")
        return True
