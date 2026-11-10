import json
import logging

import pytest

from chickentender import signin as signin_mod
from chickentender.app import App
from chickentender.signin import JS_CREATE, JS_PREFS, OPENID_URL, SgdbSignin

KEY = "0" * 32
SGDB = "https://www.steamgriddb.com/"
WS = "ws://127.0.0.1:8080/devtools/page/A"


class Browser:
    """One page target whose URL and SteamGridDB session the test scripts; records every evaluated script."""

    def __init__(self, url=SGDB, logged_in=True, key=KEY, created=None):
        self.url = url
        self.logged_in = logged_in
        self.key = key
        self.created = created
        self.open = True
        self.down = False
        self.evals = []

    async def list_pages(self):
        if self.down:
            raise ConnectionError(signin_mod.cdp.UNAVAILABLE)
        steam = {"id": "S", "type": "page", "url": "https://steamloopback.host/index.html", "webSocketDebuggerUrl": "ws://s"}
        return [steam] + ([{"id": "A", "type": "page", "url": self.url, "webSocketDebuggerUrl": WS}] if self.open else [])

    async def evaluate(self, ws, expression):
        assert ws == WS
        self.evals.append(expression)
        if expression == JS_PREFS:
            if not self.logged_in:
                return {"status": 401, "loggedIn": False}
            return {"status": 200, "loggedIn": True, "key": self.key}
        if expression == JS_CREATE:
            return {"status": 200, "key": self.created}
        if "location.href" in expression:
            self.url = json.loads(expression.split("location.href = ")[1].split(";")[0])
            return True
        raise AssertionError("unexpected script")


class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t

    async def sleep(self, s):
        self.t += s


def make(browser, submit_error="", **kw):
    submitted, changes, clock = [], [], Clock()

    async def submit(key):
        submitted.append(key)
        return submit_error

    s = SgdbSignin(submit, lambda: changes.append(s.as_dict()["stage"]), logging.getLogger("signin-test"),
                   list_pages=browser.list_pages, evaluate=browser.evaluate, sleep=clock.sleep, clock=clock, **kw)
    return s, submitted, changes, clock


async def run(s):
    s.start()
    await s.task


async def test_logged_in_reads_the_key_without_consent():
    b = Browser()
    s, submitted, changes, _ = make(b)
    await run(s)
    assert submitted == [KEY]
    assert changes == ["opening", "reading", "verifying", "done"]
    assert s.as_dict() == {"active": False, "stage": "done", "error": ""}
    assert JS_CREATE not in b.evals


async def test_waits_for_the_page_then_signs_in_through_steam():
    b = Browser(logged_in=False)
    b.open = False
    s, submitted, changes, clock = make(b)
    s.start()
    for _ in range(3):
        await s.step()
    assert s.stage == "opening"
    b.open = True
    await s.step()
    assert s.stage == "login" and b.url == OPENID_URL
    await s.step()
    assert s.stage == "consent"
    await s.step()
    assert s.stage == "consent" and not submitted
    # The user pressed Sign In: SteamGridDB finishes the OpenID login, then shows its home page.
    b.url = "https://www.steamgriddb.com/login/steam?openid.mode=id_res"
    assert not await s.step()
    b.logged_in, b.url = True, SGDB
    assert await s.step()
    assert submitted == [KEY] and s.stage == "done"
    assert changes == ["opening", "login", "consent", "reading", "verifying", "done"]
    s.task.cancel()


async def test_an_account_without_a_key_gets_one_once():
    b = Browser(key=None, created=KEY)
    s, submitted, _, _ = make(b)
    await run(s)
    assert submitted == [KEY] and s.stage == "done"
    assert b.evals.count(JS_CREATE) == 1


async def test_a_key_that_cannot_be_created_fails_after_one_attempt():
    b = Browser(key=None, created=None)
    s, submitted, _, _ = make(b)
    await run(s)
    assert not submitted and s.stage == "failed" and b.evals.count(JS_CREATE) == 1


async def test_rejected_key_fails_with_the_submit_error():
    s, _, _, _ = make(Browser(), submit_error="Invalid SteamGridDB key")
    await run(s)
    assert s.as_dict() == {"active": False, "stage": "failed", "error": "Invalid SteamGridDB key"}


async def test_closed_browser_and_missing_debugger():
    b = Browser(logged_in=False)
    s, _, _, _ = make(b)
    s.start()
    await s.step()
    b.open = False
    assert await s.step()
    assert s.error == "The browser was closed"
    s.task.cancel()

    b = Browser()
    b.down = True
    s, _, _, _ = make(b)
    await run(s)
    assert s.stage == "failed" and s.error == "Steam's browser debugging is not available"


async def test_times_out_and_cancel_resets():
    b = Browser()
    b.open = False
    s, _, _, _ = make(b, timeout_s=10)
    await run(s)
    assert s.stage == "failed" and "Timed out" in s.error

    s, _, _, _ = make(b)
    s.start()
    await s.cancel()
    assert s.as_dict() == {"active": False, "stage": "", "error": ""}


async def test_gives_up_when_steamgriddb_never_signs_in():
    b = Browser(logged_in=False)
    s, _, _, clock = make(b)
    for _ in range(30):
        if await s.step():
            break
        b.url = SGDB  # back from Steam, still logged out
        clock.t += 6
    assert s.stage == "failed" and sum("location.href" in e for e in b.evals) == signin_mod.MAX_LOGINS


async def _noop(*_a):
    pass


async def test_app_saves_the_key_and_never_shows_it(tmp_path, caplog):
    from test_sgdb import FakeSession, ok

    caplog.set_level(logging.DEBUG)
    session = FakeSession({"/search/autocomplete/a": ok([])})
    events = []

    async def emit(name, state):
        events.append(json.dumps(state))

    b = Browser()
    app = App(str(tmp_path / "settings.json"), "1.0", str(tmp_path), emit, logging.getLogger("t"),
              data_dir=str(tmp_path / "data"), sgdb_session_factory=lambda: session,
              browser={"list_pages": b.list_pages, "evaluate": b.evaluate, "sleep": _noop})
    st = await app.start_sgdb_signin()
    assert st["sgdb"]["signin"]["active"]
    await app.signin.task
    st = app.state()
    assert st["sgdb"]["configured"] and st["sgdb"]["signin"] == {"active": False, "stage": "done", "error": ""}
    assert app.store.load().sgdb_key == KEY
    for blob in [json.dumps(st), caplog.text, *events]:
        assert KEY not in blob
    await app.stop()
