"""Runtime settings, all from the environment.

Same principle as the React app's zones (ADR-0012): one image serves every
station, and `ZONE_CODE` picks the config at start-up. Nothing here is baked in
at build time, so pointing a station at a different existing zone stays a
compose restart.
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

    #: Which zone's module config to load (`config/zones/<code>.yaml`).
    zone_code: str = "test"

    #: "sim" runs the built-in simulator; "aioca" talks to a real EPICS network.
    epics_backend: str = "sim"
    sim_tick_seconds: float = 1.0
    #: Fixed seed keeps a demo reproducible; unset for fresh noise each start.
    sim_seed: int | None = 1

    #: How long a burst of PV updates is collected before one render pass. The
    #: whole point of server-side rendering here is that the operator sees a
    #: coherent panel, not 40 individually-arriving cells.
    render_interval: float = 0.15
    #: Heartbeat on the SSE stream. Resets the browser's staleness watchdog, so
    #: it must be comfortably shorter than the watchdog's threshold.
    heartbeat_seconds: float = 2.0

    #: Keep the page's monitors open for the process lifetime, so the hub's
    #: cache is warm and the first render shows real values rather than `<>`.
    prewarm: bool = True

    #: Development: reload templates on every render and reparse the YAML config
    #: on every request, so an edit shows up on refresh.
    dev: bool = False

    @property
    def backend_label(self) -> str:
        return "simulated EPICS" if self.epics_backend == "sim" else "EPICS (aioca)"

    @classmethod
    def from_env(cls) -> "Settings":
        defaults = cls()
        seed_raw = os.getenv("SIM_SEED")
        return cls(
            app_name=os.getenv("APP_NAME", defaults.app_name),
            host=os.getenv("HOST", defaults.host),
            port=_env_int("PORT", defaults.port),
            log_level=os.getenv("LOG_LEVEL", defaults.log_level).upper(),
            zone_code=os.getenv("ZONE_CODE", defaults.zone_code),
            epics_backend=os.getenv("EPICS_BACKEND", defaults.epics_backend).strip().lower(),
            sim_tick_seconds=_env_float("SIM_TICK_SECONDS", defaults.sim_tick_seconds),
            sim_seed=None
            if seed_raw is not None and seed_raw.strip() == ""
            else _env_int("SIM_SEED", defaults.sim_seed or 1),
            render_interval=_env_float("RENDER_INTERVAL", defaults.render_interval),
            heartbeat_seconds=_env_float("HEARTBEAT_SECONDS", defaults.heartbeat_seconds),
            prewarm=_env_bool("PREWARM", defaults.prewarm),
            dev=_env_bool("DEV", defaults.dev),
        )


#: Waveform presets offered by the Waveform controls. Carried over from the old
#: gateway's `/waveforms` endpoint; served with the page rather than fetched,
#: because it changes when the machine is reconfigured, not while an operator is
#: looking at it.
WAVEFORM_CATALOG: tuple[str, ...] = (
    "std-100ps",
    "narrow-50ps",
    "broad-200ps",
    "super-gauss",
    "ramp-up",
)
