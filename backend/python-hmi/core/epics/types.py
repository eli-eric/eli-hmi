"""The wire-free shape of one PV reading, plus the backend protocol.

`PvSample` is what used to travel over the WebSocket as `Message<T>` and is now
just a Python object passed to a Jinja template. Same fields, same meanings —
the presentation layer was ported against them.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from enum import Enum
from typing import Any, Callable, Protocol


class Datatype(str, Enum):
    """The subset of `aioca` datatypes this HMI asks for.

    ``ENUM_STRING`` matters: an mbbi record read at its native type delivers the
    state's *index*, not its name, so the Regen state row and the flashlamp
    channels must ask for the name. Everything else reads native.
    """

    NATIVE = "native"
    ENUM_STRING = "enum_string"
    STRING = "string"


@dataclass(frozen=True, order=True)
class PvId:
    """A monitor is identified by the PV **and** the datatype it is read as:
    two subscriptions to one record at different datatypes are two monitors.

    Ordered so a set of them can be sorted for a stable diagnostic message; the
    order itself carries no meaning.
    """

    name: str
    datatype: Datatype = Datatype.NATIVE

    def __str__(self) -> str:  # pragma: no cover - debugging aid
        if self.datatype is Datatype.NATIVE:
            return self.name
        return f"{self.name}|{self.datatype.value}"


@dataclass(frozen=True)
class LastValid:
    """The last reading taken while a PV was still trustworthy.

    Attached by the hub, never by a backend — the client-side equivalent was
    attached by `useWebSocketData`. It exists because INVALID and a disconnected
    channel both replace the reading on screen with `PV INV` / `PV DSC`, which
    leaves the tooltip as the only place that can still say what the machine was
    doing.
    """

    value: Any
    timestamp: float


@dataclass(frozen=True)
class PvSample:
    """Latest reading for one PV.

    ``ok=False`` means the gateway itself could not deliver a trustworthy value
    (channel disconnected, CA error). ``severity`` is the EPICS alarm severity
    (0..3) — *how bad*; ``status`` is the EPICS alarm status — *why*
    (`epicsAlarm.h`: 3 = HIHI, 5 = LOLO, 10 = TIMEOUT, 17 = UDF …). Typed to
    accept a string as well as the code, so a gateway can send an
    operator-facing phrase instead with no change here.
    """

    name: str
    ok: bool = True
    value: Any = None
    severity: int = 0
    status: int | str | None = None
    units: str | None = None
    timestamp: float = 0.0
    error: str | None = None
    last_valid: LastValid | None = None

    def with_last_valid(self, last_valid: "LastValid | None") -> "PvSample":
        return replace(self, last_valid=last_valid)


#: Called by a backend whenever a monitored PV reports.
MonitorCallback = Callable[[PvId, PvSample], None]


class EpicsBackend(Protocol):
    """What the hub needs from a source of PV data.

    Two implementations ship: `aioca_backend.AiocaBackend` (the real EPICS
    network, same `aioca` calls as the old gateway) and `sim_backend.SimBackend`
    (self-contained simulator, so the HMI runs on a laptop with no IOC).
    """

    async def start(self) -> None: ...

    async def stop(self) -> None: ...

    async def add_monitor(self, pv: PvId, callback: MonitorCallback) -> None:
        """Begin monitoring `pv`; call `callback` on every update."""

    async def remove_monitor(self, pv: PvId) -> None: ...

    async def caput(self, name: str, value: Any) -> None:
        """Write `value` to `name`. Raises on failure."""

