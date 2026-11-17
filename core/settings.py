"""Runtime settings, all from the environment.

One image serves every zone. What differs between stations is the zone, and a
station does not have to be told which one it is — `core.zones` reads it from
the hostname when `ZONE_CODE` is unset.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


class SettingsError(Exception):
    """A malformed environment variable. Raised rather than letting `int()`
    surface as a bare `ValueError`: `PORT=abc` is a deployment mistake and
    should read like one.
    """


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError as exc:
        raise SettingsError(f"{name}={raw!r} is not a number") from exc


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise SettingsError(f"{name}={raw!r} is not a whole number") from exc


@dataclass(frozen=True)
class Settings:
    app_name: str = "eli-hmi"
    host: str = "0.0.0.0"
    #: 8082, the port the React app used — operators have it bookmarked.
    port: int = 8082
    log_level: str = "INFO"
    #: Where the log book (`core.logbook`) keeps its rotating file, so `/monitor`
    #: still has the history after a restart. Empty: memory only.
    log_dir: str = ""

    #: Which zone folder to serve. Empty means "work it out from the hostname".
    zone_code: str = ""

    #: "sim" runs the built-in simulator; "aioca" talks to a real EPICS network.
    epics_backend: str = "sim"
    sim_tick_seconds: float = 1.0
    #: Fixed seed keeps a demo reproducible; unset for fresh noise each start.
    sim_seed: int | None = 1

    #: How long a burst of PV updates is collected before one render pass. The
    #: whole point of server-side rendering here is that the operator sees a
    #: coherent screen, not 40 individually-arriving cells.
    render_interval: float = 0.15
    #: Heartbeat on the SSE stream. Resets the browser's staleness watchdog, so
    #: it must be comfortably shorter than the watchdog's threshold.
    heartbeat_seconds: float = 2.0

    #: Keep the screens' monitors open for the process lifetime, so the hub's
    #: cache is warm and the first render shows real values rather than `<>`.
    prewarm: bool = True

    #: Colour palette on <html data-palette="…">. `l4-goggles` repaints every
    #: negative indication in a colour that survives the L4 hall's safety
    #: goggles; see the tone layer in `core/static/css/hmi.css`.
    palette: str | None = None

    #: Development: reload templates on every render, and accept the built-in
    #: `test`/`test` account (see `core.auth`). Never set on a station.
    dev: bool = False

    #: Key the session cookie is signed with. Required in production: without
    #: it every restart would sign every operator out. `DEV=1` generates one.
    session_secret: str = ""
    #: How long a station may go unused before it asks for a sign-in again —
    #: every request renews the session (`core.login`). Long on purpose: a
    #: screen left open all night makes no request until its stream reconnects,
    #: and nobody wants operators signed out from under a running machine.
    session_hours: float = 720.0
    #: `Secure` on the session cookie. Default off because stations are served
    #: over plain HTTP inside the zone network today; set it the moment there
    #: is TLS in front, or the cookie travels in clear on the first request.
    session_cookie_secure: bool = False

    #: How long an exclusive PV stays held after the last screen showing it
    #: closed in the holder's tab (`core.locks`). Long enough for a reload or a
    #: stream reconnect, short enough that a closed tab does not keep a valve
    #: from everyone else for the rest of the shift.
    lock_grace_seconds: float = 60.0

    #: Who serves camera frames. `embedded`: this process. A URL such as
    #: `http://station:8083`: a standalone gateway (`python -m cameras`), so
    #: a burst of camera traffic cannot slow a control write; pages connect
    #: there. `off`: no camera frames at all.
    camera_gateway: str = "embedded"
    #: Where the standalone camera gateway (`python -m cameras`) listens. The
    #: HMI keeps 8082; the gateway is the next port up.
    camera_port: int = 8083

    @property
    def cameras_embedded(self) -> bool:
        return self.camera_gateway == "embedded"

    @property
    def camera_gateway_url(self) -> str | None:
        """Base URL pages fetch frames from: "" for this app, `None` for none."""
        if self.camera_gateway == "embedded":
            return ""
        if self.camera_gateway == "off":
            return None
        return self.camera_gateway.rstrip("/")

    @property
    def backend_label(self) -> str:
        return "simulated EPICS" if self.epics_backend == "sim" else "EPICS (aioca)"

    @classmethod
    def from_env(cls) -> "Settings":
        defaults = cls()
        seed_raw = os.getenv("SIM_SEED")
        palette = os.getenv("PALETTE", "").strip()
        return cls(
            app_name=os.getenv("APP_NAME", defaults.app_name),
            host=os.getenv("HOST", defaults.host),
            port=_env_int("PORT", defaults.port),
            log_level=os.getenv("LOG_LEVEL", defaults.log_level).upper(),
            log_dir=os.getenv("LOG_DIR", defaults.log_dir).strip(),
            zone_code=os.getenv("ZONE_CODE", defaults.zone_code).strip(),
            epics_backend=os.getenv("EPICS_BACKEND", defaults.epics_backend).strip().lower(),
            sim_tick_seconds=_env_float("SIM_TICK_SECONDS", defaults.sim_tick_seconds),
            sim_seed=None
            if seed_raw is not None and seed_raw.strip() == ""
            else _env_int("SIM_SEED", defaults.sim_seed or 1),
            render_interval=_env_float("RENDER_INTERVAL", defaults.render_interval),
            heartbeat_seconds=_env_float("HEARTBEAT_SECONDS", defaults.heartbeat_seconds),
            prewarm=_env_bool("PREWARM", defaults.prewarm),
            palette=palette or None,
            dev=_env_bool("DEV", defaults.dev),
            session_secret=os.getenv("SESSION_SECRET", defaults.session_secret).strip(),
            session_hours=_env_float("SESSION_HOURS", defaults.session_hours),
            session_cookie_secure=_env_bool(
                "SESSION_COOKIE_SECURE", defaults.session_cookie_secure
            ),
            lock_grace_seconds=_env_float("LOCK_GRACE_SECONDS", defaults.lock_grace_seconds),
            camera_gateway=_camera_gateway(os.getenv("CAMERA_GATEWAY", defaults.camera_gateway)),
            camera_port=_env_int("CAMERA_PORT", defaults.camera_port),
        )


def _camera_gateway(raw: str) -> str:
    value = raw.strip() or "embedded"
    if value.lower() in {"embedded", "off"}:
        return value.lower()
    if not value.startswith(("http://", "https://")):
        raise SettingsError(
            f"CAMERA_GATEWAY={raw!r} is not 'embedded', 'off' or an http(s):// URL"
        )
    return value
