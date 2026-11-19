"""Real EPICS network, via `aioca` — the same calls the retired FastAPI gateway
made (its `aioca_api.py`, in git history).

Kept behind the `EpicsBackend` protocol so the HMI also runs with the simulator
on a machine that has no Channel Access at all. `aioca` (and the
`epicscorelibs` wheel underneath it) is imported lazily for the same reason: an
engineer running the UI locally should not need it installed.

Subscriptions run at `FORMAT_TIME`, which is what carries the alarm severity and
the timestamp the presentation layer needs. `FORMAT_CTRL` would add the EGU
field, but it is a heavier request per monitor, and units come from the module
config today — see `presentation/formatting.resolve_units`, whose `metadata`
tier is fed here the moment a control-format read lands.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from core.epics.types import PvDescription, Datatype, MonitorCallback, PvId, PvSample

logger = logging.getLogger(__name__)


def _import_aioca():
    try:
        import aioca  # noqa: PLC0415 - deliberately lazy
    except ImportError as exc:  # pragma: no cover - depends on the host
        raise RuntimeError(
            "EPICS_BACKEND=aioca needs the `aioca` package "
            "(uv sync --extra epics). Use EPICS_BACKEND=sim to run "
            "without a Channel Access network."
        ) from exc
    return aioca


class AiocaBackend:
    def __init__(self, *, connect_timeout: float = 5.0):
        self._aioca = None
        self._connect_timeout = connect_timeout
        self._subscriptions: dict[PvId, Any] = {}
        self._loop: asyncio.AbstractEventLoop | None = None

    async def start(self) -> None:
        self._aioca = _import_aioca()
        self._loop = asyncio.get_running_loop()
        logger.info("aioca backend ready")

    async def stop(self) -> None:
        for pv, subscription in list(self._subscriptions.items()):
            try:
                subscription.close()
            except Exception:  # pragma: no cover
                logger.exception("Failed to close monitor for %s", pv)
        self._subscriptions.clear()
        if self._aioca is not None:
            try:
                self._aioca.purge_channel_caches()
            except Exception:  # pragma: no cover
                logger.exception("Failed to purge aioca channel caches")

    def _datatype(self, datatype: Datatype) -> Any:
        if datatype is Datatype.ENUM_STRING:
            return self._aioca.DBR_ENUM_STR
        if datatype is Datatype.STRING:
            return str
        if datatype is Datatype.NUMBER:
            # `float` is aioca's spelling of DBR_DOUBLE. Not DBR_FLOAT: that
            # is the 32-bit request, and a setpoint read back through it comes
            # home with digits the operator did not type.
            return float
        return None

    async def add_monitor(self, pv: PvId, callback: MonitorCallback) -> None:
        if pv in self._subscriptions:
            return
        aioca = self._aioca
        loop = self._loop
        assert aioca is not None and loop is not None, "start() must run first"

        def on_update(value: Any) -> None:
            # aioca dispatches on its own thread; hop back to the event loop so
            # the hub (and every render loop behind it) stays single-threaded.
            loop.call_soon_threadsafe(callback, pv, to_sample(pv.name, value))

        self._subscriptions[pv] = aioca.camonitor(
            pv.name,
            on_update,
            datatype=self._datatype(pv.datatype),
            format=aioca.FORMAT_TIME,
            notify_disconnect=True,
            connect_timeout=self._connect_timeout,
        )

    async def describe(self, pv: PvId) -> PvDescription:
        """What this record will accept. An unanswered read is an empty
        description, not an error: a register whose limits are unknown is
        still writable, just without a range on the field."""
        aioca = self._aioca
        assert aioca is not None, "start() must run first"
        try:
            return await _describe(aioca, pv, self._connect_timeout)
        except Exception as exc:  # noqa: BLE001 - any failure degrades the same
            logger.warning("control fields unavailable for %s: %s", pv.name, exc)
            return PvDescription()

    async def remove_monitor(self, pv: PvId) -> None:
        subscription = self._subscriptions.pop(pv, None)
        if subscription is None:
            return
        try:
            subscription.close()
        except Exception:  # pragma: no cover
            logger.exception("Failed to close monitor for %s", pv)

    async def caput(self, name: str, value: Any) -> None:
        aioca = self._aioca
        assert aioca is not None, "start() must run first"
        await aioca.caput(name, value, timeout=10.0, throw=True)

    async def caget(self, pv: PvId) -> PvSample:
        """One read at the datatype the monitors use, so the answer renders
        exactly as a monitor update would. `throw=False`: a channel that will
        not answer comes back as a failed value, which `to_sample` turns into
        a not-ok sample rather than an exception."""
        aioca = self._aioca
        assert aioca is not None, "start() must run first"
        value = await aioca.caget(
            pv.name,
            datatype=self._datatype(pv.datatype),
            format=aioca.FORMAT_TIME,
            timeout=self._connect_timeout,
            throw=False,
        )
        return to_sample(pv.name, value)


async def _describe(aioca_module: Any, pv: PvId, timeout: float) -> PvDescription:
    """One `FORMAT_CTRL` read: what the record will accept.

    Deliberately not what the monitors ask for — the control fields are a
    heavier request and a device has hundreds of registers, so this is done
    for the one being written, when it is selected.
    """
    value = await aioca_module.caget(
        pv.name, format=aioca_module.FORMAT_CTRL, timeout=timeout
    )
    enums = tuple(getattr(value, "enums", ()) or ())
    return PvDescription(
        units=getattr(value, "units", None) or None,
        precision=getattr(value, "precision", None),
        # Drive limits, not display limits: DRVL/DRVH are what the record
        # will take, while LOPR/HOPR are only how it likes to be drawn.
        low=getattr(value, "lower_ctrl_limit", None),
        high=getattr(value, "upper_ctrl_limit", None),
        states=enums,
    )


def to_sample(name: str, value: Any) -> PvSample:
    """`aioca` augmented value -> `PvSample`.

    `aioca` returns values that subclass the underlying numpy/str type and carry
    `.ok`, `.severity`, `.timestamp`; a failed update is an `AugmentedValue`
    whose `.ok` is False and whose `str()` is the CA error.
    """
    ok = bool(getattr(value, "ok", True))
    if not ok:
        return PvSample(name=name, ok=False, error=str(value), severity=3)
    return PvSample(
        name=name,
        ok=True,
        value=_plain(value),
        severity=int(getattr(value, "severity", 0) or 0),
        status=getattr(value, "status", None),
        units=getattr(value, "units", None),
        timestamp=float(getattr(value, "timestamp", 0.0) or 0.0),
    )


def _plain(value: Any) -> Any:
    """Strip numpy/aioca wrappers so templates and `==` comparisons see plain
    Python.

    A NaN is deliberately passed through rather than turned into `None`: `None`
    means "this PV has never reported", and a readout showing `<>` for a sensor
    that is very much reporting — reporting NaN — is the lie the payload checks
    in `readouts.py` exist to prevent. `_numeric_fault` turns it into `PV INV`
    with the reason in the tooltip.
    """
    if hasattr(value, "tolist"):
        value = value.tolist()
    elif hasattr(value, "item") and not isinstance(value, (str, bytes, bytearray)):
        try:
            value = value.item()
        except (ValueError, AttributeError):
            pass
    if isinstance(value, (bytes, bytearray)):
        return value.decode("utf-8", "replace")
    return value
