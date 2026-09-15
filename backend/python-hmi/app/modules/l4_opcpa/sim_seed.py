"""Seeds the simulator from the laser config — the Python counterpart of
`backend/mockup-websocket-server/l4_opcpa.go`.

The Go mock inferred a PV's type from its name prefix (`AI_` float, `BI_` bool,
`SI_` string), which is why the test zone's config still carries a few
`SI_NL2_*` names: the convention had leaked out of the mock and into PV naming.
This version reads the *config* instead — the role a PV plays in the panel is
already written down there, so a chiller flow is a float because it is a chiller
flow, not because of how it is spelled.

What gets seeded, and why it looks the way it does:

* at-rest defaults for every laser, so a fresh start shows a sane machine;
* two PVs deliberately alarmed (one MINOR, one MAJOR) and one INVALID, so the
  tone layer and the aggregate pills are exercised without an operator having to
  arrange a fault;
* command effects — a press writes many records over a few seconds, which is
  what the real backend does and the only way the Sequencer row has anything to
  show.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Sequence

from app.epics.sim_backend import SimBackend, SimSpec

from .config import LaserSpec
from .pv_names import LASER_COMMANDS, OPERATOR_VALUED_COMMANDS, sequence_state_pv
from .widgets import SEQUENCES

logger = logging.getLogger(__name__)

#: Flashlamp channel states, in the order the enum publishes them.
FLASHLAMP_ENUM = ("STANDBY", "RUN", "STOP", "FAILURE", "IGNITION", "BUSY", "OFF")
#: Regen `:State` enum.
REGEN_ENUM = ("OFF", "ON", "STANDBY", "FAILURE")


def seed(sim: SimBackend, specs: Sequence[LaserSpec]) -> None:
    for spec in specs:
        _seed_laser(sim, spec)


def _seed_laser(sim: SimBackend, spec: LaserSpec) -> None:
    pvs = spec.pvs
    laser = spec.laser

    sim.declare_many(
        [
            SimSpec(pvs.connection, "bool", value=1, drifts=False),
            SimSpec(pvs.full_power, "bool", value=1, drifts=False),
            SimSpec(pvs.shutter, "bool", value=0, drifts=False),
            SimSpec(pvs.phd_mean, "float", low=0.4, high=1.6, jitter=0.03),
            SimSpec(pvs.regen_state, "enum", value=1, enums=REGEN_ENUM, drifts=False),
            SimSpec(pvs.regen_temp, "float", low=21.5, high=24.5, jitter=0.02, units="°C"),
            SimSpec(pvs.phd2_mean, "float", low=0.2, high=0.9, jitter=0.03),
            SimSpec(pvs.attenuator, "int", value=51, low=0, high=100, drifts=False),
            SimSpec(pvs.loaded_waveform, "string", value="std-100ps", drifts=False),
        ]
    )
    if pvs.latest_waveform:
        sim.declare(SimSpec(pvs.latest_waveform, "string", value="narrow-50ps", drifts=False))
    if pvs.modbox_mbc1:
        sim.declare(SimSpec(pvs.modbox_mbc1, "float", low=1.8, high=2.4, jitter=0.02))
    if pvs.modbox_mbc2:
        sim.declare(SimSpec(pvs.modbox_mbc2, "float", low=1.8, high=2.4, jitter=0.02))
    if pvs.sequencer_running:
        sim.declare(SimSpec(pvs.sequencer_running, "bool", value=0, drifts=False))

    # Trigger delay: all readouts equal, per spec. Flipping one of them by hand
    # (POST /api/write) is how the MISMATCH branch gets exercised.
    for name in spec.trigger_delay:
        sim.declare(SimSpec(name, "int", value=790, low=0, high=2000, drifts=False, units="ns"))

    # MSS permissions: all granted at rest. The last one carries a MINOR alarm so
    # the aggregate pill has something to aggregate.
    for index, item in enumerate(spec.mss):
        severity = 1 if index == len(spec.mss) - 1 else 0
        sim.declare(SimSpec(item.pv, "bool", value=1, drifts=False, severity=severity))

    # Module errors report a status code, "0000" meaning OK. One non-zero, so
    # the ERR count is not always 0/22.
    for index, item in enumerate(spec.module_errors):
        value = "0021" if index == 4 else "0000"
        sim.declare(SimSpec(item.pv, "string", value=value, drifts=False))

    for index, chiller in enumerate(spec.chillers):
        # One chiller runs hot enough that its IOC raises MAJOR, and one level
        # reading is INVALID — the two cases an operator has to be able to tell
        # apart at a glance (a real reading the control system dislikes, versus a
        # reading that cannot be trusted at all).
        sim.declare(SimSpec(chiller.flow, "float", low=10.0, high=16.0, jitter=0.02, units="l/min"))
        sim.declare(
            SimSpec(
                chiller.temp,
                "float",
                low=22.0,
                high=27.0,
                jitter=0.02,
                units="°C",
                severity=2 if index == 1 else 0,
            )
        )
        sim.declare(
            SimSpec(
                chiller.level,
                "float",
                low=70.0,
                high=99.0,
                jitter=0.01,
                units="%",
                severity=3 if index == 2 else 0,
            )
        )

    for index, item in enumerate(spec.flashlamps):
        # Mostly standby at rest, with two channels stopped, so the tally row is
        # not a single column of 14.
        state = 2 if index in (4, 5) else 0
        sim.declare(SimSpec(item.pv, "enum", value=state, enums=FLASHLAMP_ENUM, drifts=False))

    for item in spec.modbox:
        sim.declare(SimSpec(item.pv, "bool", value=1, drifts=False))

    # Per-sequence state PVs. Proof of concept, as in the React app: no real PV
    # exists for these yet, and the Sequencer row is specified to show them.
    for _, command in SEQUENCES:
        sim.declare(SimSpec(sequence_state_pv(laser, command), "bool", value=0, drifts=False))

    _register_commands(sim, spec)


def _register_commands(sim: SimBackend, spec: LaserSpec) -> None:
    """Wire each exposed command to its effect chain.

    A command PV is a trigger, not a value: the backend turns one press into a
    coordinated set of writes. These chains are deliberately short — enough to
    make the panel respond honestly to a press, not a model of the machine.
    """
    laser = spec.laser
    pvs = spec.pvs

    async def run_sequence(command: str, effect) -> None:
        state_pv = sequence_state_pv(laser, command)
        sim.set_value(state_pv, 1)
        if pvs.sequencer_running:
            sim.set_value(pvs.sequencer_running, 1)
        try:
            await effect()
        finally:
            # 3 s, matching the mock backend's hold before effect PVs are
            # released back to their drift.
            await asyncio.sleep(3.0)
            sim.set_value(state_pv, 0)
            if pvs.sequencer_running:
                sim.set_value(pvs.sequencer_running, 0)

    async def start_laser(_sim: SimBackend, _value: object) -> None:
        async def effect() -> None:
            sim.set_value(pvs.full_power, 1)
            sim.set_value(pvs.shutter, 1)
            sim.set_value(pvs.regen_state, "ON")
            for item in spec.flashlamps:
                sim.set_value(item.pv, "RUN")
            await asyncio.sleep(0)

        await run_sequence("START_LASER", effect)

    async def stop_laser(_sim: SimBackend, _value: object) -> None:
        async def effect() -> None:
            sim.set_value(pvs.shutter, 0)
            sim.set_value(pvs.full_power, 0)
            sim.set_value(pvs.regen_state, "OFF")
            for item in spec.flashlamps:
                sim.set_value(item.pv, "STOP")
            await asyncio.sleep(0)

        await run_sequence("STOP_LASER", effect)

    async def alignment_mode(_sim: SimBackend, _value: object) -> None:
        async def effect() -> None:
            sim.set_value(pvs.full_power, 0)
            sim.set_value(pvs.regen_state, "STANDBY")
            await asyncio.sleep(0)

        await run_sequence("ALIGNMENT_MODE", effect)

    async def system_standby(_sim: SimBackend, _value: object) -> None:
        async def effect() -> None:
            sim.set_value(pvs.full_power, 0)
            sim.set_value(pvs.shutter, 0)
            for item in spec.flashlamps:
                sim.set_value(item.pv, "STANDBY")
            await asyncio.sleep(0)

        await run_sequence("SYSTEM_STANDBY", effect)

    async def flashlamps(state: str, command: str) -> None:
        async def effect() -> None:
            for item in spec.flashlamps:
                sim.set_value(item.pv, state)
            await asyncio.sleep(0)

        await run_sequence(command, effect)

    async def modbox(value: int) -> None:
        for item in spec.modbox:
            sim.set_value(item.pv, value)

    handlers = {
        "START_LASER": start_laser,
        "STOP_LASER": stop_laser,
        "ALIGNMENT_MODE": alignment_mode,
        "SYSTEM_STANDBY": system_standby,
        "FLASHLAMPS_RUN": lambda _s, _v: flashlamps("RUN", "FLASHLAMPS_RUN"),
        "FLASHLAMPS_STANDBY": lambda _s, _v: flashlamps("STANDBY", "FLASHLAMPS_STANDBY"),
        "MODBOX_ON": lambda _s, _v: modbox(1),
        "MODBOX_OFF": lambda _s, _v: modbox(0),
        "SET_DELAY": lambda _s, value: _set_delay(sim, spec, value),
        "LOAD_WAVEFORM": lambda _s, value: _load_waveform(sim, spec, value),
    }

    for command in LASER_COMMANDS:
        if not spec.can(command):
            continue
        target = spec.resolve_command(command)
        handler = handlers.get(command)
        if handler is None:  # pragma: no cover - LASER_COMMANDS is exhaustive
            continue
        # The written value disambiguates two commands sharing one record
        # (MODBOX_ON/OFF on a single mode PV). An operator-valued command
        # (SET_DELAY, LOAD_WAVEFORM) has no fixed value to key on, and nothing
        # else writes its PV, so it registers without one.
        key = None if command in OPERATOR_VALUED_COMMANDS else target.value
        sim.register_command(target.pv_name, handler, value=key)


async def _set_delay(sim: SimBackend, spec: LaserSpec, value: object) -> None:
    """One write, several records: the delay PVs are specified to read equal, and
    the control system is what keeps them that way.
    """
    for name in spec.trigger_delay:
        sim.set_value(name, value)


async def _load_waveform(sim: SimBackend, spec: LaserSpec, value: object) -> None:
    """Applying a preset moves the current one into Waveform Latest, which is
    what that row is for.
    """
    previous = sim.spec(spec.pvs.loaded_waveform)
    if spec.pvs.latest_waveform and previous is not None:
        sim.set_value(spec.pvs.latest_waveform, previous.value)
    sim.set_value(spec.pvs.loaded_waveform, value)
