"""Self-contained PV simulator — the Go mock server
(`backend/mockup-websocket-server/l4_opcpa.go`) reimplemented as an in-process
backend so the HMI is a single `python -m app` with no IOC and no second
service.

It exists for the same two jobs the Go mock did: developing the UI on a laptop,
and demonstrating the panel. It is **not** a production target — the production
path is `aioca_backend`, selected with `EPICS_BACKEND=aioca`.

Behaviour worth knowing:

* every PV is declared up front by the module that needs it (`declare`), so the
  simulator never has to guess a type from the name — that guessing is exactly
  what made the Go mock's `AI_`/`BI_`/`SI_` prefix convention leak into PV
  naming;
* `caput` writes the value through and holds it: a manual write wins over the
  drift for `hold_seconds`, so pressing "Open Shutter" and watching the readout
  actually tests the write path;
* a *command* PV runs a registered effect chain, which is how the real backend
  behaves (one press, many writes) and the only way the Sequencer row has
  anything to show.
"""

from __future__ import annotations

import asyncio
import logging
import random
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Iterable, Literal

from app.epics.types import Datatype, MonitorCallback, PvId, PvSample

logger = logging.getLogger(__name__)

SimKind = Literal["bool", "float", "int", "enum", "string"]

#: A command effect: given the simulator, apply whatever writes the press means.
CommandHandler = Callable[["SimBackend", Any], Awaitable[None]]


@dataclass
class SimSpec:
    """How one simulated PV behaves."""

    name: str
    kind: SimKind
    value: Any = None
    #: Drift bounds for `float`/`int`.
    low: float = 0.0
    high: float = 1.0
    #: Fraction of the band a single tick may move.
    jitter: float = 0.01
    #: Enum state names; `value` is the index.
    enums: tuple[str, ...] = ()
    #: EPICS alarm severity this PV reports (0..3). Set a couple non-zero so the
    #: tone layer is actually exercised in a demo.
    severity: int = 0
    units: str | None = None
    #: False for a PV that only ever changes when written (shutter, waveform).
    drifts: bool = True
    #: How long a manual write outranks the drift.
    hold_seconds: float = 10.0
    held_until: float = field(default=0.0, repr=False)


class SimBackend:
    def __init__(self, *, tick_seconds: float = 1.0, seed: int | None = None):
        self._specs: dict[str, SimSpec] = {}
        self._commands: dict[str, list[tuple[Any, CommandHandler]]] = {}
        self._monitors: dict[PvId, MonitorCallback] = {}
        self._tick_seconds = tick_seconds
        self._random = random.Random(seed)
        self._task: asyncio.Task[None] | None = None
        self._effects: set[asyncio.Task[None]] = set()

    # ---------------------------------------------------------------- declaring

    def declare(self, spec: SimSpec) -> SimSpec:
        """Register a PV. First declaration wins, so a module can declare a PV
        twice (two widgets, one record) without clobbering the first spec.
        """
        return self._specs.setdefault(spec.name, spec)

    def declare_many(self, specs: Iterable[SimSpec]) -> None:
        for spec in specs:
            self.declare(spec)

    def register_command(
        self, pv_name: str, handler: CommandHandler, *, value: Any = None
    ) -> None:
        """Register an effect chain for a write to `pv_name`.

        Keyed by PV **and** written value, because two commands legitimately
        share one record when they write different values — MODBOX_ON/OFF on a
        single mode PV is the configured case in the test zone. Keying by PV
        alone let the second registration silently win, so pressing "ON" ran
        "OFF".
        """
        self._commands.setdefault(pv_name, []).append((value, handler))
        self.declare(SimSpec(name=pv_name, kind="int", value=0, drifts=False))

    def spec(self, name: str) -> SimSpec | None:
        return self._specs.get(name)

    # ---------------------------------------------------------------- lifecycle

    async def start(self) -> None:
        for spec in self._specs.values():
            if spec.value is None:
                spec.value = self._initial(spec)
        self._task = asyncio.create_task(self._run(), name="sim-ticker")
        logger.info("Simulated EPICS backend started (%d PVs)", len(self._specs))

    async def stop(self) -> None:
        for task in [self._task, *self._effects]:
            if task is not None:
                task.cancel()
        self._task = None
        self._effects.clear()

    # ----------------------------------------------------------------- monitors

    async def add_monitor(self, pv: PvId, callback: MonitorCallback) -> None:
        self._monitors[pv] = callback
        # Deliver the current value immediately: the first paint should show the
        # machine, not a grid of placeholders.
        callback(pv, self._sample(pv))

    async def remove_monitor(self, pv: PvId) -> None:
        self._monitors.pop(pv, None)

    # ------------------------------------------------------------------- writes

    async def caput(self, name: str, value: Any) -> None:
        handler = self._resolve_command(name, value)
        if handler is not None:
            logger.info("SIM command %s <- %r", name, value)
            self._set(name, value if isinstance(value, (int, float)) else 1)
            task = asyncio.create_task(self._run_effect(handler, value))
            self._effects.add(task)
            task.add_done_callback(self._effects.discard)
            return

        spec = self._specs.get(name)
        if spec is None:
            # An unknown PV is still writable — the operator asked for it, and
            # refusing would hide a config/PV-name mismatch behind a 502 that
            # looks like a network fault.
            spec = self.declare(SimSpec(name=name, kind="string", value="", drifts=False))
        logger.info("SIM write %s <- %r", name, value)
        self._set(name, self._coerce(spec, value), hold=True)

    def _resolve_command(self, name: str, written: Any) -> CommandHandler | None:
        """Pick the effect chain for this write: the one registered for exactly
        this value, else the one registered without a value.
        """
        registered = self._commands.get(name)
        if not registered:
            return None
        for expected, handler in registered:
            if expected is not None and str(expected) == str(written):
                return handler
        for expected, handler in registered:
            if expected is None:
                return handler
        return None

    async def _run_effect(self, handler: CommandHandler, value: Any) -> None:
        try:
            await handler(self, value)
        except asyncio.CancelledError:  # pragma: no cover
            raise
        except Exception:
            logger.exception("Simulated command effect failed")

    # ------------------------------------------------------------ value helpers

    def set_value(self, name: str, value: Any, *, hold: bool = True) -> None:
        """Effect-chain helper: write a value as if an operator had."""
        spec = self._specs.get(name)
        if spec is None:
            return
        self._set(name, self._coerce(spec, value), hold=hold)

    def _set(self, name: str, value: Any, *, hold: bool = False) -> None:
        spec = self._specs.get(name)
        if spec is None:
            return
        spec.value = value
        if hold:
            spec.held_until = time.monotonic() + spec.hold_seconds
        self._publish(name)

    def _coerce(self, spec: SimSpec, value: Any) -> Any:
        if spec.kind == "bool":
            return 1 if _truthy(value) else 0
        if spec.kind == "int":
            try:
                return int(float(value))
            except (TypeError, ValueError):
                return spec.value
        if spec.kind == "float":
            try:
                return float(value)
            except (TypeError, ValueError):
                return spec.value
        if spec.kind == "enum":
            text = str(value)
            for index, name in enumerate(spec.enums):
                if name.upper() == text.upper():
                    return index
            try:
                return max(0, min(len(spec.enums) - 1, int(float(value))))
            except (TypeError, ValueError):
                return spec.value
        return str(value)

    def _initial(self, spec: SimSpec) -> Any:
        if spec.kind == "bool":
            return 1
        if spec.kind == "float":
            return round(self._random.uniform(spec.low, spec.high), 3)
        if spec.kind == "int":
            return int(self._random.uniform(spec.low, spec.high))
        if spec.kind == "enum":
            return 0
        return ""

    def _publish(self, name: str) -> None:
        for pv, callback in list(self._monitors.items()):
            if pv.name == name:
                callback(pv, self._sample(pv))

    def _sample(self, pv: PvId) -> PvSample:
        spec = self._specs.get(pv.name)
        if spec is None:
            return PvSample(name=pv.name, ok=False, error="PV not found in simulator")
        value = spec.value
        if spec.kind == "enum":
            index = int(value or 0)
            if pv.datatype is Datatype.ENUM_STRING:
                value = spec.enums[index] if 0 <= index < len(spec.enums) else str(index)
            else:
                value = index
        elif pv.datatype is Datatype.ENUM_STRING or pv.datatype is Datatype.STRING:
            value = str(value)
        return PvSample(
            name=pv.name,
            ok=True,
            value=value,
            severity=spec.severity,
            units=spec.units,
            timestamp=time.time(),
        )

    # -------------------------------------------------------------------- ticker

    async def _run(self) -> None:
        while True:
            await asyncio.sleep(self._tick_seconds)
            now = time.monotonic()
            for spec in self._specs.values():
                if not spec.drifts or spec.held_until > now:
                    continue
                moved = self._drift(spec)
                if moved:
                    self._publish(spec.name)

    def _drift(self, spec: SimSpec) -> bool:
        if spec.kind == "float":
            band = spec.high - spec.low
            step = self._random.uniform(-1, 1) * band * spec.jitter
            spec.value = round(min(spec.high, max(spec.low, float(spec.value or 0) + step)), 4)
            return True
        if spec.kind == "int":
            step = self._random.choice((-1, 0, 1))
            spec.value = int(min(spec.high, max(spec.low, int(spec.value or 0) + step)))
            return step != 0
        # Booleans, enums and strings hold their state: a shutter does not flap
        # and a waveform preset does not rename itself. They change on a write
        # or as the effect of a command, which is what makes the panel readable.
        return False


def _truthy(value: Any) -> bool:
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "on", "yes", "open", "run"}
    try:
        return float(value) != 0
    except (TypeError, ValueError):
        return False
