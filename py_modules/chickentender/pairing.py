"""RomM's device code flow: the Deck shows a short code, the owner approves it in RomM's web UI, we poll for the token."""
import asyncio
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

from .romm import RommClient, RommError

SCOPES = [
    "me.read", "roms.read", "platforms.read", "assets.read", "firmware.read", "collections.read",
    "roms.user.read", "roms.user.write", "devices.read", "devices.write",
]


@dataclass
class PairingState:
    status: str = "idle"  # idle | waiting | approved | expired | denied | error
    user_code: str = ""
    verification_url: str = ""
    expires_at: float = 0
    error: str = ""

    def as_dict(self) -> dict:
        return {
            "status": self.status,
            "user_code": self.user_code,
            "verification_url": self.verification_url,
            "expires_at": self.expires_at,
            "error": self.error,
        }


@dataclass
class DevicePairing:
    client: RommClient
    identity: dict
    on_change: Callable[[], None]
    on_approved: Callable[[dict], Awaitable[None]]
    state: PairingState = field(default_factory=PairingState)
    _task: asyncio.Task | None = None

    async def start(self) -> None:
        await self.cancel()
        try:
            init = await self.client.device_auth_init({**self.identity, "requested_scopes": SCOPES})
        except RommError as e:
            self.state = PairingState(status="error", error=str(e.detail))
            self.on_change()
            return
        self.state = PairingState(
            status="waiting",
            user_code=init["user_code"],
            verification_url=self.client.url(init["verification_path_complete"]),
            expires_at=time.time() + init["expires_in"],
        )
        self.on_change()
        self._task = asyncio.create_task(self._poll(init["device_code"], max(int(init.get("interval", 5)), 2)))

    async def cancel(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
        self._task = None
        if self.state.status == "waiting":
            self.state = PairingState()
            self.on_change()

    async def _poll(self, device_code: str, interval: int) -> None:
        while True:
            await asyncio.sleep(interval)
            try:
                token = await self.client.device_auth_token(device_code)
            except RommError as e:
                code = e.code
                if code == "authorization_pending":
                    continue
                if code == "slow_down":
                    interval += 5
                    continue
                self.state = PairingState(
                    status="denied" if code == "access_denied" else "expired" if code == "expired_token" else "error",
                    error="" if code in ("access_denied", "expired_token") else str(e.detail),
                )
                self.on_change()
                return
            except Exception as e:  # network blip: keep polling until the code expires
                if time.time() > self.state.expires_at:
                    self.state = PairingState(status="error", error=str(e))
                    self.on_change()
                    return
                continue
            self.state = PairingState(status="approved")
            await self.on_approved(token)
            self.on_change()
            return
