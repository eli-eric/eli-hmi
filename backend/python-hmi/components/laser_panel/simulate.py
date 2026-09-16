"""What each of a laser's PVs is — for the simulator and the local IOC.

One declaration, two consumers: `core/epics/sim_backend.py` invents values from
these, and `ioc/generate.py` turns them into real EPICS records. That is why
pressing Start Laser does the same thing in both, and why neither of them has
any laser-specific code in it.

This replaces the Go mock's `l4_opcpa.go`, which inferred a PV's type from its
name prefix (`AI_` float, `BI_` bool, `SI_` string) — the guessing that made the
mock's naming convention leak into real PV names.

What gets declared, and why it looks the way it does:

* at-rest defaults for the whole laser, so a fresh start shows a sane machine;
* a few deliberate faults (see FAULTS), so the panel's MINOR / MAJOR / INVALID
  paths and its aggregate pills are exercised without anyone having to break a
  chiller;
* one command chain per exposed command: one press, many writes, and a busy
  flag held for a moment — which is the only reason the Sequencer row has
  anything to show.
"""

from __future__ import annotations

from typing import Any

from core.components import PvSpec

from .commands import LASER_COMMANDS, OPERATOR_VALUED_COMMANDS, sequence_state_pv
from .config import Config
from .readings import SEQUENCES

#: Flashlamp channel states, in the order the enum record publishes them.
FLASHLAMP_ENUM = ("STANDBY", "RUN", "STOP", "FAILURE", "IGNITION", "BUSY", "OFF")
#: Regen `:State` enum.
REGEN_ENUM = ("OFF", "ON", "STANDBY", "FAILURE")

#: Bands for the analogue readouts, by signal role. Chosen to sit inside their
#: alarm limits at rest, so a quiet machine looks quiet and an injected fault is
#: the only thing alarming.
BANDS: dict[str, dict[str, Any]] = {
    "phdMean": {"low": 0.40, "high": 1.60, "prec": 3, "egu": "mJ"},
    "phd2Mean": {"low": 0.20, "high": 0.90, "prec": 3, "egu": "mJ"},
    "regenTemp": {"low": 21.5, "high": 24.0, "prec": 3, "egu": "degC",
                  "high_alarm": 24.5, "hihi": 25.0},
    "chillerFlow": {"low": 11.5, "high": 15.5, "prec": 3, "egu": "l/min",
                    "low_alarm": 11.0, "lolo": 10.0},
    "chillerTemp": {"low": 22.0, "high": 24.5, "prec": 3, "egu": "degC",
                    "high_alarm": 25.5, "hihi": 26.5},
    "chillerLevel": {"low": 80.0, "high": 98.0, "prec": 3, "egu": "%",
                     "low_alarm": 75.0, "lolo": 70.0},
    "modboxMbc": {"low": 1.80, "high": 2.40, "prec": 2, "egu": "V"},
}

#: Faults every simulated laser starts with. Each is a different *kind* of bad
#: news, because telling them apart at a glance is the panel's whole job:
#:
#: - the second chiller's temperature runs above its HIHI -> MAJOR, a real
#:   reading the control system is unhappy about, still displayed;
#: - the third chiller's water level is never initialised -> INVALID/UDF, no
#:   reading at all, which reads as `PV INV`;
#: - the last MSS permission is denied and its record calls that MINOR;
#: - one module reports a non-zero error code, so ERR is not 0/22;
#: - two flashlamp channels sit in STOP, so the tally is not one full column.
FAULTS = {
    "chiller_major_temp": 1,
    "chiller_invalid_level": 2,
    "module_error": 4,
    "flashlamps_stopped": (4, 5),
}


def laser_pv_specs(cfg: Config) -> list[PvSpec]:
    specs: list[PvSpec] = []
    pvs = cfg.pvs
    laser = cfg.laser

    def analog(name: str, role: str, *, shift: float = 0.0, undefined: bool = False) -> None:
        band = dict(BANDS[role])
        low = band.pop("low") + shift
        high = band.pop("high") + shift
        prec = band.pop("prec")
        specs.append(
            PvSpec(
                name=name,
                kind="float",
                low=low,
                high=high,
                # A fortieth of the band per tick: visibly alive, not noise.
                step=(high - low) / 40.0,
                prec=prec,
                undefined=undefined,
                desc=f"{laser} {role}",
                **band,
            )
        )

    # -- readbacks ---------------------------------------------------------
    specs += [
        PvSpec(
            name=pvs.connection,
            kind="bool",
            value=1,
            states=("Disconnected", "Connected"),
            desc=f"{laser} connection",
        ),
        PvSpec(name=pvs.full_power, kind="bool", value=1, desc=f"{laser} at full power"),
        PvSpec(
            name=pvs.shutter,
            kind="bool",
            value=0,
            states=("CLOSED", "OPEN"),
            writable=True,
            desc=f"{laser} shutter",
        ),
        PvSpec(
            name=pvs.regen_state,
            kind="enum",
            value=1,
            states=REGEN_ENUM,
            desc=f"{laser} regen state",
        ),
    ]
    analog(pvs.phd_mean, "phdMean")
    analog(pvs.phd2_mean, "phd2Mean")
    analog(pvs.regen_temp, "regenTemp")
    if pvs.sequencer_running:
        specs.append(
            PvSpec(
                name=pvs.sequencer_running,
                kind="bool",
                value=0,
                states=("IDLE", "RUNNING"),
                desc=f"{laser} sequencer busy",
            )
        )

    # The attenuator is written directly by the panel, not by a command.
    specs.append(
        PvSpec(
            name=pvs.attenuator,
            kind="int",
            value=51,
            low=0,
            high=100,
            writable=True,
            desc=f"{laser} attenuator position",
        )
    )

    # -- MSS permissions and module errors ---------------------------------
    for index, item in enumerate(cfg.mss):
        denied = index == len(cfg.mss) - 1
        specs.append(
            PvSpec(
                name=item.pv,
                kind="bool",
                value=0 if denied else 1,
                severity=1 if denied else 0,
                desc=item.label,
            )
        )
    for index, item in enumerate(cfg.module_errors):
        specs.append(
            PvSpec(
                name=item.pv,
                kind="string",
                value="0021" if index == FAULTS["module_error"] else "0000",
                desc=f"{item.label} error code",
            )
        )

    # -- chillers ----------------------------------------------------------
    for index, chiller in enumerate(cfg.chillers):
        analog(chiller.flow, "chillerFlow")
        analog(
            chiller.temp,
            "chillerTemp",
            shift=4.0 if index == FAULTS["chiller_major_temp"] else 0.0,
        )
        analog(
            chiller.level,
            "chillerLevel",
            undefined=index == FAULTS["chiller_invalid_level"],
        )

    # -- flashlamps and trigger delay --------------------------------------
    for index, item in enumerate(cfg.flashlamps):
        specs.append(
            PvSpec(
                name=item.pv,
                kind="enum",
                value=FLASHLAMP_ENUM.index("STOP") if index in FAULTS["flashlamps_stopped"] else 0,
                states=FLASHLAMP_ENUM,
                desc=item.label,
            )
        )
    delay = cfg.delay_presets[-1] if cfg.delay_presets else 790
    for name in cfg.trigger_delay:
        specs.append(
            PvSpec(name=name, kind="int", value=delay, low=0, high=2000, egu="ns",
                   desc=f"{laser} trigger delay")
        )

    # -- Modbox ------------------------------------------------------------
    for item in cfg.modbox:
        specs.append(PvSpec(name=item.pv, kind="bool", value=1, desc=item.label))
    if cfg.modbox:
        specs.append(
            PvSpec(
                name=pvs.loaded_waveform,
                kind="string",
                value="std-100ps",
                desc=f"{laser} loaded waveform",
            )
        )
        if pvs.latest_waveform:
            specs.append(
                PvSpec(
                    name=pvs.latest_waveform,
                    kind="string",
                    value="narrow-50ps",
                    desc=f"{laser} previous waveform",
                )
            )
        for name, role in ((pvs.modbox_mbc1, "MBC1"), (pvs.modbox_mbc2, "MBC2")):
            if name:
                analog(name, "modboxMbc")

    # -- per-sequence state PVs --------------------------------------------
    #
    # PROOF OF CONCEPT, carried over from the React app: the real control system
    # does not expose a state PV per sequence yet, and the Sequencer row is
    # specified to show them.
    for _label, command in SEQUENCES:
        specs.append(
            PvSpec(
                name=sequence_state_pv(laser, command),
                kind="bool",
                value=0,
                states=("IDLE", "RUNNING"),
                desc=f"{command} state",
            )
        )

    specs += _command_specs(cfg)
    return specs


def _command_specs(cfg: Config) -> list[PvSpec]:
    """One spec per exposed command, carrying the writes its press makes.

    These chains are deliberately short — enough to make the panel respond
    honestly to a press, not a model of the machine. A real backend's
    `start_laser` writes 25 PVs; what a screen needs is that the shutter opens,
    the flashlamps run and the sequencer says RUNNING for a moment.
    """
    pvs = cfg.pvs
    laser = cfg.laser
    flashlamp_pvs = [item.pv for item in cfg.flashlamps]
    modbox_pvs = [item.pv for item in cfg.modbox]

    def flashlamps(state: str) -> list[tuple[str, Any]]:
        index = FLASHLAMP_ENUM.index(state)
        return [(pv, index) for pv in flashlamp_pvs]

    chains: dict[str, list[tuple[str, Any]]] = {
        "START_LASER": [
            (pvs.full_power, 1),
            (pvs.shutter, 1),
            (pvs.regen_state, REGEN_ENUM.index("ON")),
            *flashlamps("RUN"),
        ],
        "STOP_LASER": [
            (pvs.shutter, 0),
            (pvs.full_power, 0),
            (pvs.regen_state, REGEN_ENUM.index("OFF")),
            *flashlamps("STOP"),
        ],
        "ALIGNMENT_MODE": [
            (pvs.full_power, 0),
            (pvs.regen_state, REGEN_ENUM.index("STANDBY")),
        ],
        "SYSTEM_STANDBY": [
            (pvs.full_power, 0),
            (pvs.shutter, 0),
            *flashlamps("STANDBY"),
        ],
        "FLASHLAMPS_RUN": flashlamps("RUN"),
        "FLASHLAMPS_STANDBY": flashlamps("STANDBY"),
        "MODBOX_ON": [(pv, 1) for pv in modbox_pvs],
        "MODBOX_OFF": [(pv, 0) for pv in modbox_pvs],
        # `None` as the value means "write whatever the operator sent".
        "SET_DELAY": [(name, None) for name in cfg.trigger_delay],
        "LOAD_WAVEFORM": [(pvs.loaded_waveform, None)],
    }
    sequenced = {command for _label, command in SEQUENCES}

    specs: list[PvSpec] = []
    for command in LASER_COMMANDS:
        if not cfg.can(command):
            continue
        effects = chains.get(command)
        if not effects:
            continue
        target = cfg.resolve_command(command)
        # A sequenced command shows RUNNING while it runs: its own state PV, and
        # the laser's sequencer flag. The rest are instantaneous.
        busy: tuple[str, ...] = ()
        if command in sequenced:
            busy = tuple(
                pv
                for pv in (sequence_state_pv(laser, command), pvs.sequencer_running)
                if pv
            )
        specs.append(
            PvSpec(
                name=target.pv_name,
                kind="string" if command in OPERATOR_VALUED_COMMANDS else "int",
                command=True,
                # The written value disambiguates two commands that share one
                # record (MODBOX_ON/OFF on a single mode PV).
                value=None if command in OPERATOR_VALUED_COMMANDS else target.value,
                effects=tuple(effects),
                busy=busy,
                desc=f"{command} trigger",
            )
        )
    return specs
