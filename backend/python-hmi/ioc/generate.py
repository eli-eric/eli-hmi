#!/usr/bin/env python3
"""Generate an EPICS database from the L4 OPCPA module config.

    python ioc/generate.py              # from the `test` zone
    python ioc/generate.py --zone demo

Writes two files, and both have to be generated together or they drift:

* ``ioc/db/l4-opcpa.db`` — one record per PV the panel reads or writes.
* ``config/zones/ioc.yaml`` — the zone the HMI runs with against this IOC.
  Identical to the source zone except for the handful of PVs that name a
  *field* of a record type EPICS base does not have (see FIELD_PVS below).

Why generate rather than hand-write: the old `backend/epics/laser-mockup-ioc`
db was maintained by hand against a config that kept changing, so it drifted —
half its records still carried the Go mock's `AI_`/`BI_` names while the config
had moved to real ones. The config is the only source of PV names in this
repository, so the database is derived from it and a rename cannot leave the
IOC behind.

WHAT IS SIMULATED, AND HOW
--------------------------
Everything here is done with plain base records, because that is the point: the
HMI should be talking to something that behaves like an IOC, not to a Python
process pretending to be one.

* **Analogue readouts** are `calc` records that random-walk inside a band
  (``MIN(D,MAX(C,A+(RNDM-0.5)*B))`` with ``INPA`` pointing at their own VAL).
  They carry EGU, PREC and real HIGH/HIHI/LOW/LOLO alarm limits, so MINOR and
  MAJOR severities on the panel come from the control system, exactly as they
  would in the hall.
* **Commands** are `bo` records whose FLNK fires a `seq` record: one press, a
  coordinated set of writes, and a 3 s delayed step that clears the sequencer
  state. That is what makes the Sequencer row show RUNNING then IDLE.
* **One write to many records** is a `dfanout` — all 14 flashlamp channels, or
  both trigger-delay channels from one setpoint.
* **The waveform swap** (applying a preset moves the old one into "latest") is
  a `fanout` driving two `stringout` records with ``OMSL=closed_loop``, which
  is the record-level way to say "copy this field to that one, in this order".
* **Faults are injected deliberately** (see INJECTED_FAULTS) so the panel's
  MINOR / MAJOR / INVALID paths and its aggregate pills are exercised without
  anyone having to break a chiller.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field as dc_field
from pathlib import Path
from typing import Any, Iterable

import yaml

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.modules.l4_opcpa.config import LaserSpec, parse_laser_specs  # noqa: E402
from app.modules.l4_opcpa.pv_names import LASER_COMMANDS  # noqa: E402
from app.modules.l4_opcpa.widgets import SEQUENCES  # noqa: E402

DB_PATH = ROOT / "ioc" / "db" / "l4-opcpa.db"
IOC_ZONE = "ioc"

#: How often the analogue readouts move. Fast enough to look live, slow enough
#: that a browser tab is not repainting constantly — the HMI coalesces bursts
#: anyway (RENDER_INTERVAL), so this is about the IOC's own load.
SCAN = "1 second"

#: Enum states, in index order.
REGEN_STATES = ("OFF", "ON", "STANDBY", "FAILURE")
FLASHLAMP_STATES = ("STANDBY", "RUN", "STOP", "FAILURE", "IGNITION", "BUSY", "OFF")

MBB_STATE_FIELDS = (
    "ZRST", "ONST", "TWST", "THST", "FRST", "FVST", "SXST", "SVST",
    "EIST", "NIST", "TEST", "ELST", "TVST", "TTST", "FTST", "FFST",
)
DFANOUT_OUTPUTS = "ABCDEFGHIJKLMNOP"

#: PVs in the config that name a *field* of a record type EPICS base does not
#: provide, mapped to the base-compatible name this IOC serves instead.
#:
#: ``PortControl.CNCT`` is asynRecord's connection field and
#: ``SetAlignmentMode.BUSY`` is an sseqRecord's busy flag — both synApps, both
#: needing a full EPICS build to reproduce. A record name cannot contain a dot
#: (Channel Access splits the name there to find the field), so these cannot be
#: served under their real names by any base-only IOC. The generated `ioc` zone
#: points them at colon-separated stand-ins; that is what the zone mechanism is
#: for, and the divergence is mechanical rather than hand-edited.
FIELD_PVS_NOTE = "names a field of a synApps record type"


@dataclass(frozen=True)
class Analog:
    """A random-walking readout: band, step, and its alarm limits."""

    low: float
    high: float
    step: float
    prec: int = 3
    egu: str = ""
    high_alarm: float | None = None
    hihi: float | None = None
    low_alarm: float | None = None
    lolo: float | None = None

    def shifted(self, by: float) -> "Analog":
        """The same readout running `by` higher — how a fault is injected."""
        return Analog(
            low=self.low + by,
            high=self.high + by,
            step=self.step,
            prec=self.prec,
            egu=self.egu,
            high_alarm=self.high_alarm,
            hihi=self.hihi,
            low_alarm=self.low_alarm,
            lolo=self.lolo,
        )


#: Bands per signal role. Chosen to sit inside their alarm limits at rest, so a
#: quiet machine looks quiet and an injected fault is the only thing alarming.
ANALOG_ROLES: dict[str, Analog] = {
    "phdMean": Analog(0.40, 1.60, 0.05, prec=3, egu="mJ"),
    "phd2Mean": Analog(0.20, 0.90, 0.04, prec=3, egu="mJ"),
    "regenTemp": Analog(21.5, 24.0, 0.08, prec=3, egu="degC", high_alarm=24.5, hihi=25.0),
    "chillerFlow": Analog(11.5, 15.5, 0.12, prec=3, egu="l/min", low_alarm=11.0, lolo=10.0),
    "chillerTemp": Analog(22.0, 24.5, 0.10, prec=3, egu="degC", high_alarm=25.5, hihi=26.5),
    "chillerLevel": Analog(80.0, 98.0, 0.40, prec=3, egu="%", low_alarm=75.0, lolo=70.0),
    "modboxMbc": Analog(1.80, 2.40, 0.03, prec=2, egu="V"),
}

#: Faults every laser starts with, so the tone layer and the aggregate pills are
#: exercised from the first page load. Each one is a different *kind* of bad
#: news, because the whole point of the panel is that an operator can tell them
#: apart at a glance:
#:
#: - chiller 2's temperature runs above its HIHI limit -> MAJOR, real reading;
#: - chiller 3's water level is never processed -> INVALID/UDF, no reading;
#: - the last MSS permission is denied and its record calls that MINOR;
#: - one module reports a non-zero error code, so ERR is not 0/22.
INJECTED_FAULTS = {
    "chiller_major_temp_index": 1,
    "chiller_invalid_level_index": 2,
    "module_error_index": 4,
    "flashlamps_stopped": (4, 5),
}


@dataclass
class Db:
    """Accumulates records, emitting each PV exactly once.

    Some PVs are shared between lasers on purpose — a site-wide interlock like
    `L4-PSS:NP2_PERMISSION_TO_OPERATE_CH1` appears in every laser's MSS list,
    because every laser watches it. That is one record, referenced many times,
    so the second request for it is skipped rather than duplicated.

    What is *not* tolerated is the same name asked for with a different
    definition. `dbLoadRecords` would silently take the last one and the IOC
    would serve a record nobody meant — the class of drift this generator exists
    to prevent — so that fails loudly with both definitions.
    """

    lines: list[str] = dc_field(default_factory=list)
    names: set[str] = dc_field(default_factory=set)
    #: Rendered block per name, to tell a shared PV from a conflicting one.
    blocks: dict[str, str] = dc_field(default_factory=dict)
    #: Names referenced by more than one laser.
    shared: set[str] = dc_field(default_factory=set)

    def comment(self, text: str = "") -> None:
        self.lines.append(f"# {text}" if text else "#")

    def section(self, title: str) -> None:
        self.lines.append("")
        self.lines.append("# " + "-" * 74)
        self.lines.append(f"# {title}")
        self.lines.append("# " + "-" * 74)

    def record(
        self,
        rtype: str,
        name: str,
        fields: Iterable[tuple[str, Any]],
        *,
        note: str | None = None,
    ) -> str:
        block = [f'record({rtype}, "{name}") {{']
        for key, value in fields:
            if value is None:
                continue
            block.append(f'    field({key}, "{value}")')
        block.append("}")
        rendered = "\n".join(block)

        if name in self.names:
            if self.blocks[name] != rendered:
                raise SystemExit(
                    f"{name} is asked for twice with different definitions:\n\n"
                    f"{self.blocks[name]}\n\nand\n\n{rendered}\n"
                )
            # A site-wide PV that several lasers read. One record, many readers.
            self.shared.add(name)
            return name

        self.names.add(name)
        self.blocks[name] = rendered
        if note:
            self.lines.append(f"# {note}")
        self.lines.extend(block)
        return name

    def render(self) -> str:
        return "\n".join(self.lines) + "\n"


def analog(db: Db, name: str, profile: Analog, desc: str, *, undefined: bool = False) -> None:
    """A `calc` record that random-walks inside its band.

    ``INPA`` reads the record's own VAL, so each scan moves from where the last
    one left off instead of jumping around the band — a drifting readout looks
    like a machine, uniform noise looks like a fault.

    ``undefined=True`` leaves the record unprocessed (no SCAN, no PINI, no VAL).
    Channel Access then reports it UDF/INVALID, which is what the panel's
    `PV INV` state and the `invalid` tone are for. This is not a trick: it is
    precisely what an un-initialised record looks like in a real IOC.
    """
    mid = round((profile.low + profile.high) / 2, profile.prec)
    fields: list[tuple[str, Any]] = [("DESC", desc[:40])]
    if undefined:
        fields += [("SCAN", "Passive")]
    else:
        fields += [
            ("SCAN", SCAN),
            ("PINI", "YES"),
            ("VAL", mid),
            ("INPA", f"{name}.VAL NPP NMS"),
            ("B", profile.step),
            ("C", profile.low),
            ("D", profile.high),
            ("CALC", "MIN(D,MAX(C,A+(RNDM-0.5)*B))"),
        ]
    fields += [
        ("EGU", profile.egu or None),
        ("PREC", profile.prec),
        ("LOPR", profile.low),
        ("HOPR", profile.high),
        ("HIGH", profile.high_alarm),
        ("HSV", "MINOR" if profile.high_alarm is not None else None),
        ("HIHI", profile.hihi),
        ("HHSV", "MAJOR" if profile.hihi is not None else None),
        ("LOW", profile.low_alarm),
        ("LSV", "MINOR" if profile.low_alarm is not None else None),
        ("LOLO", profile.lolo),
        ("LLSV", "MAJOR" if profile.lolo is not None else None),
    ]
    note = None
    if undefined:
        note = "Deliberately never processed: reads INVALID/UDF (panel shows PV INV)."
    db.record("calc", name, fields, note=note)


def boolean(
    db: Db,
    name: str,
    desc: str,
    *,
    value: int = 1,
    zero: str = "off",
    one: str = "on",
    zero_severity: str | None = None,
) -> None:
    """A soft `bi`: a readback that the IOC's own sequences write to.

    Input records with no INP keep whatever is written to VAL, which is how a
    simulation drives a readback without pretending to be device support.
    """
    db.record(
        "bi",
        name,
        [
            ("DESC", desc[:40]),
            ("PINI", "YES"),
            ("VAL", value),
            ("ZNAM", zero),
            ("ONAM", one),
            ("ZSV", zero_severity),
        ],
    )


def enum_in(db: Db, name: str, desc: str, states: Iterable[str], value: int = 0) -> None:
    """A soft `mbbi` — the record type the panel asks for by state *name*
    (`datatype='enum_string'`), because reading it natively would give the index.
    """
    fields: list[tuple[str, Any]] = [("DESC", desc[:40]), ("PINI", "YES"), ("VAL", value)]
    for state_field, state in zip(MBB_STATE_FIELDS, states):
        fields.append((state_field, state))
    db.record("mbbi", name, fields)


def sequence_record(
    db: Db,
    name: str,
    steps: list[tuple[float, Any, str]],
    *,
    note: str | None = None,
) -> str:
    """A `seq` record: up to 16 (delay, value, target) steps, all executed.

    This is the honest version of "a command is a coordinated set of writes":
    the delay lives in the record, not in a Python `sleep`, and the IOC keeps
    running while the sequence plays out.
    """
    if len(steps) > 16:
        raise SystemExit(f"{name}: a seq record holds 16 steps, got {len(steps)}")
    fields: list[tuple[str, Any]] = [("DESC", f"sequence {name.split(':')[-1]}"[:40]), ("SELM", "All")]
    for index, (delay, value, target) in enumerate(steps):
        suffix = "0123456789ABCDEF"[index]
        fields += [
            (f"DLY{suffix}", delay),
            (f"DO{suffix}", value),
            (f"LNK{suffix}", f"{target} PP"),
        ]
    return db.record("seq", name, fields, note=note)


def fan_out(db: Db, name: str, targets: list[str], desc: str, value: int = 0) -> str:
    """A `dfanout`: one value, many records. 16 outputs, which is enough for
    the 14 flashlamp channels — the reason this is one record and not a loop.
    """
    if len(targets) > len(DFANOUT_OUTPUTS):
        raise SystemExit(f"{name}: a dfanout holds {len(DFANOUT_OUTPUTS)} outputs")
    fields: list[tuple[str, Any]] = [("DESC", desc[:40]), ("VAL", value)]
    for letter, target in zip(DFANOUT_OUTPUTS, targets):
        fields.append((f"OUT{letter}", f"{target} PP"))
    return db.record("dfanout", name, fields)


# ---------------------------------------------------------------------------
# One laser
# ---------------------------------------------------------------------------


def build_laser(db: Db, spec: LaserSpec, rewrite: dict[str, str]) -> None:
    laser = spec.laser
    pvs = spec.pvs
    prefix = f"SIM:{laser}"  # internal helper records, never read by the panel

    def real(name: str) -> str:
        """The name this IOC serves for a config PV (see FIELD_PVS_NOTE)."""
        return rewrite.get(name, name)

    db.section(f"{laser} — status readbacks")
    boolean(
        db,
        real(pvs.connection),
        f"{laser} controller connection",
        zero="Disconnected",
        one="Connected",
    )
    boolean(db, real(pvs.full_power), f"{laser} at full power", value=1)
    boolean(db, real(pvs.shutter), f"{laser} shutter", value=0, zero="CLOSED", one="OPEN")
    analog(db, pvs.phd_mean, ANALOG_ROLES["phdMean"], f"{laser} PHD1 mean")
    analog(db, pvs.phd2_mean, ANALOG_ROLES["phd2Mean"], f"{laser} PHD2 mean")
    enum_in(db, pvs.regen_state, f"{laser} regen state", REGEN_STATES, value=1)
    analog(db, pvs.regen_temp, ANALOG_ROLES["regenTemp"], f"{laser} regen temperature")
    if pvs.sequencer_running:
        boolean(
            db,
            real(pvs.sequencer_running),
            f"{laser} sequencer busy",
            value=0,
            zero="IDLE",
            one="RUNNING",
        )

    db.section(f"{laser} — MSS permissions and module errors")
    # The last permission is denied, and the record itself calls that MINOR: the
    # panel must show NO *and* a warning tone, which is the case that proves the
    # aggregate pill is reading severity rather than counting bits.
    for index, item in enumerate(spec.mss):
        denied = index == len(spec.mss) - 1
        boolean(
            db,
            item.pv,
            item.label,
            value=0 if denied else 1,
            zero="NO",
            one="YES",
            zero_severity="MINOR" if denied else None,
        )
    for index, item in enumerate(spec.module_errors):
        code = "0021" if index == INJECTED_FAULTS["module_error_index"] else "0000"
        db.record(
            "stringin",
            item.pv,
            [("DESC", f"{item.label} error code"[:40]), ("PINI", "YES"), ("VAL", code)],
        )

    db.section(f"{laser} — chillers")
    for index, chiller in enumerate(spec.chillers):
        analog(db, chiller.flow, ANALOG_ROLES["chillerFlow"], f"{chiller.label} flow")
        # Runs hot enough that its own HIHI limit fires: a real reading the
        # control system is unhappy about, which the panel must keep showing.
        hot = index == INJECTED_FAULTS["chiller_major_temp_index"]
        temp = ANALOG_ROLES["chillerTemp"]
        analog(
            db,
            chiller.temp,
            temp.shifted(4.0) if hot else temp,
            f"{chiller.label} outlet temperature",
        )
        analog(
            db,
            chiller.level,
            ANALOG_ROLES["chillerLevel"],
            f"{chiller.label} water level",
            undefined=index == INJECTED_FAULTS["chiller_invalid_level_index"],
        )

    db.section(f"{laser} — flashlamps and trigger delay")
    for index, item in enumerate(spec.flashlamps):
        state = 2 if index in INJECTED_FAULTS["flashlamps_stopped"] else 0
        enum_in(db, item.pv, item.label, FLASHLAMP_STATES, value=state)
    flashlamp_fan = fan_out(
        db,
        f"{prefix}:flashlampsAll",
        [item.pv for item in spec.flashlamps],
        f"{laser} all flashlamp channels",
    )
    for name in spec.trigger_delay:
        db.record(
            "longin",
            name,
            [
                ("DESC", f"{laser} trigger delay"[:40]),
                ("PINI", "YES"),
                ("VAL", spec.delay_presets[-1] if spec.delay_presets else 790),
                ("EGU", "ns"),
            ],
        )

    db.section(f"{laser} — Modbox")
    for item in spec.modbox:
        boolean(db, item.pv, item.label, value=1, zero="OFF", one="ON")
    modbox_fan = (
        fan_out(
            db,
            f"{prefix}:modboxAll",
            [item.pv for item in spec.modbox],
            f"{laser} all modbox subsystems",
            value=1,
        )
        if spec.modbox
        else None
    )
    if spec.modbox:
        db.record(
            "stringin",
            pvs.loaded_waveform,
            [("DESC", f"{laser} loaded waveform"[:40]), ("PINI", "YES"), ("VAL", "std-100ps")],
        )
        if pvs.latest_waveform:
            db.record(
                "stringin",
                pvs.latest_waveform,
                [
                    ("DESC", f"{laser} previous waveform"[:40]),
                    ("PINI", "YES"),
                    ("VAL", "narrow-50ps"),
                ],
            )
        for name, role in ((pvs.modbox_mbc1, "MBC1"), (pvs.modbox_mbc2, "MBC2")):
            if name:
                analog(db, name, ANALOG_ROLES["modboxMbc"], f"{laser} {role} bias")

    db.section(f"{laser} — operator setpoints")
    db.record(
        "longout",
        pvs.attenuator,
        [
            ("DESC", f"{laser} attenuator position"[:40]),
            ("PINI", "YES"),
            ("VAL", 51),
            ("DRVL", 0),
            ("DRVH", 100),
        ],
        note="Written directly by the panel (Set Attenuator); no command chain.",
    )

    _build_commands(db, spec, prefix, flashlamp_fan, modbox_fan, real)


def _build_commands(
    db: Db,
    spec: LaserSpec,
    prefix: str,
    flashlamp_fan: str,
    modbox_fan: str | None,
    real,
) -> None:
    """Command records and their effect chains.

    Every command the config exposes gets a record at the exact PV the panel
    posts to — the code-built `CMD_<laser>_<NAME>` for a placeholder, or the
    real device PV when the config names one. Its FLNK runs a `seq` whose steps
    are the writes a real backend would make.
    """
    laser = spec.laser
    pvs = spec.pvs
    sequence_states = {command: f"BI_{laser}_SEQ_{command}" for _, command in SEQUENCES}

    db.section(f"{laser} — sequencer state (proof of concept, as in the React app)")
    for label, command in SEQUENCES:
        db.record(
            "bi",
            sequence_states[command],
            [
                ("DESC", f"{label} state"[:40]),
                ("PINI", "YES"),
                ("VAL", 0),
                ("ZNAM", "IDLE"),
                ("ONAM", "RUNNING"),
            ],
        )

    def busy_steps(command: str) -> tuple[list[tuple[float, Any, str]], list[tuple[float, Any, str]]]:
        """The RUNNING / IDLE bracket every sequence writes around its effects.

        3 s of RUNNING is long enough for an operator to see the Sequencer row
        change, and matches the hold the Go mock used before releasing its
        effect PVs.
        """
        state = sequence_states.get(command)
        head: list[tuple[float, Any, str]] = []
        tail: list[tuple[float, Any, str]] = []
        if state:
            head.append((0, 1, state))
            tail.append((3, 0, state))
        if pvs.sequencer_running:
            head.append((0, 1, real(pvs.sequencer_running)))
            tail.append((0, 0, real(pvs.sequencer_running)))
        return head, tail

    def effects_for(command: str) -> list[tuple[float, Any, str]] | None:
        """The writes one press makes. `None` means the command needs something
        other than a `seq` (a string value, or a fan-out setpoint).
        """
        if command == "START_LASER":
            return [
                (0, 1, real(pvs.full_power)),
                (0, 1, real(pvs.shutter)),
                (0, REGEN_STATES.index("ON"), pvs.regen_state),
                (0, FLASHLAMP_STATES.index("RUN"), flashlamp_fan),
            ]
        if command == "STOP_LASER":
            return [
                (0, 0, real(pvs.shutter)),
                (0, 0, real(pvs.full_power)),
                (0, REGEN_STATES.index("OFF"), pvs.regen_state),
                (0, FLASHLAMP_STATES.index("STOP"), flashlamp_fan),
            ]
        if command == "ALIGNMENT_MODE":
            return [
                (0, 0, real(pvs.full_power)),
                (0, REGEN_STATES.index("STANDBY"), pvs.regen_state),
            ]
        if command == "SYSTEM_STANDBY":
            return [
                (0, 0, real(pvs.full_power)),
                (0, 0, real(pvs.shutter)),
                (0, FLASHLAMP_STATES.index("STANDBY"), flashlamp_fan),
            ]
        if command == "FLASHLAMPS_RUN":
            return [(0, FLASHLAMP_STATES.index("RUN"), flashlamp_fan)]
        if command == "FLASHLAMPS_STANDBY":
            return [(0, FLASHLAMP_STATES.index("STANDBY"), flashlamp_fan)]
        if command in ("MODBOX_ON", "MODBOX_OFF") and modbox_fan:
            return [(0, 1 if command == "MODBOX_ON" else 0, modbox_fan)]
        return None

    db.section(f"{laser} — commands")
    for command in LASER_COMMANDS:
        if not spec.can(command):
            continue
        target = spec.resolve_command(command)
        pv = target.pv_name

        if command == "SET_DELAY":
            # One setpoint, two channels, and the spec says they must read
            # equal — so the IOC is what keeps them equal, via a dfanout.
            fan_out(
                db,
                pv,
                list(spec.trigger_delay),
                f"{laser} set both channel delays",
                value=spec.delay_presets[-1] if spec.delay_presets else 790,
            )
            continue

        if command == "LOAD_WAVEFORM":
            _build_waveform_chain(db, spec, prefix, pv)
            continue

        effects = effects_for(command)
        if effects is None:
            db.comment(f"{command}: no effect chain (nothing in the config to drive)")
            continue

        head, tail = busy_steps(command)
        sequence = f"{prefix}:seq{command.title().replace('_', '')}"
        # No PINI on a command record: it would fire the whole chain at IOC
        # start-up, which is how the first version of this database managed to
        # boot with the shutter open and the waveform blank.
        is_string_target = command == "MODBOX_OFF" and not isinstance(target.value, (int, float))
        db.record(
            "stringout" if is_string_target else "bo",
            pv,
            [
                ("DESC", f"{command} trigger"[:40]),
                ("FLNK", sequence),
            ]
            + ([] if is_string_target else [("ZNAM", "IDLE"), ("ONAM", "GO")]),
            note=(
                f"Writing {target.value!r} here runs the {command} chain. Base has no "
                "record that can compare strings, so ANY write to it runs the chain — "
                "the panel only ever writes this one value."
                if is_string_target
                else None
            ),
        )
        sequence_record(db, sequence, head + effects + tail)


def _build_waveform_chain(db: Db, spec: LaserSpec, prefix: str, command_pv: str) -> None:
    """Applying a preset moves the current one into "Waveform Latest".

    A `seq` record cannot do this — its steps carry doubles, and a waveform name
    is a string. Two `stringout` records with ``OMSL=closed_loop`` copy one
    field to another, and a `fanout` runs them in the order that matters: save
    the old value first, then overwrite it.
    """
    loaded = spec.pvs.loaded_waveform
    latest = spec.pvs.latest_waveform
    save = f"{prefix}:wfSaveOld"
    apply_ = f"{prefix}:wfApply"
    fan = f"{prefix}:wfFan"

    db.record(
        "stringout",
        command_pv,
        [("DESC", "LOAD_WAVEFORM trigger"[:40]), ("FLNK", fan)],
        note="The panel writes the waveform name here; the chain below applies it.",
    )
    links: list[tuple[str, Any]] = [("DESC", "waveform apply order"[:40])]
    if latest:
        links.append(("LNK1", save))
        links.append(("LNK2", apply_))
    else:
        links.append(("LNK1", apply_))
    db.record("fanout", fan, links)
    if latest:
        db.record(
            "stringout",
            save,
            [
                ("DESC", "previous waveform -> latest"[:40]),
                ("DOL", f"{loaded} NPP NMS"),
                ("OMSL", "closed_loop"),
                ("OUT", f"{latest} PP"),
            ],
        )
    db.record(
        "stringout",
        apply_,
        [
            ("DESC", "command waveform -> loaded"[:40]),
            ("DOL", f"{command_pv} NPP NMS"),
            ("OMSL", "closed_loop"),
            ("OUT", f"{loaded} PP"),
        ],
    )


# ---------------------------------------------------------------------------
# The IOC-compatible zone
# ---------------------------------------------------------------------------

#: Every place a PV name can appear in the zone file. Walking these explicitly
#: rather than every string in the document keeps labels and units out of the
#: rewrite — `l/min` has no dot, but a label one day might.
PV_PATHS = (
    ("pvs", None),
    ("triggerDelay", None),
    ("mss", "pv"),
    ("moduleErrors", "pv"),
    ("flashlamps", "pv"),
    ("modbox", "pv"),
)


def field_pv_rewrite(raw: dict[str, Any]) -> dict[str, str]:
    """Find PVs that name a record field, and the name to serve instead.

    A dot in a PV name means "field of this record", and a record name cannot
    contain one — so any such PV is unreachable on a base-only IOC. The stand-in
    replaces the last dot with a colon, which is a normal PV name.
    """
    rewrite: dict[str, str] = {}

    def consider(name: Any) -> None:
        if isinstance(name, str) and "." in name:
            head, _, tail = name.rpartition(".")
            rewrite[name] = f"{head}:{tail}"

    for laser in raw.get("lasers", []):
        for key, sub in PV_PATHS:
            block = laser.get(key)
            if isinstance(block, dict):
                for value in block.values():
                    consider(value)
            elif isinstance(block, list):
                for item in block:
                    consider(item.get(sub) if sub and isinstance(item, dict) else item)
        for chiller in laser.get("chillers", []):
            for key in ("flow", "temp", "level"):
                consider(chiller.get(key))
        for target in (laser.get("commands") or {}).values():
            consider(target if isinstance(target, str) else (target or {}).get("pv"))
    return rewrite


def rewrite_zone(raw: dict[str, Any], rewrite: dict[str, str]) -> dict[str, Any]:
    def swap(value: Any) -> Any:
        return rewrite.get(value, value) if isinstance(value, str) else value

    for laser in raw.get("lasers", []):
        for key, sub in PV_PATHS:
            block = laser.get(key)
            if isinstance(block, dict):
                for field_name, value in list(block.items()):
                    block[field_name] = swap(value)
            elif isinstance(block, list):
                for index, item in enumerate(block):
                    if sub and isinstance(item, dict):
                        item[sub] = swap(item[sub])
                    else:
                        block[index] = swap(item)
        for chiller in laser.get("chillers", []):
            for key in ("flow", "temp", "level"):
                chiller[key] = swap(chiller[key])
        commands = laser.get("commands") or {}
        for command, target in list(commands.items()):
            if isinstance(target, str):
                commands[command] = swap(target)
            elif isinstance(target, dict) and "pv" in target:
                target["pv"] = swap(target["pv"])
    return raw


# ---------------------------------------------------------------------------


def _short(path: Path) -> str:
    """Repo-relative when it is inside the app, absolute otherwise — a `--db`
    pointing at a scratch directory should still print usefully.
    """
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--zone", default="test", help="source zone (default: test)")
    parser.add_argument(
        "--db", type=Path, default=DB_PATH, help=f"output database (default: {DB_PATH})"
    )
    args = parser.parse_args()

    source = ROOT / "config" / "zones" / f"{args.zone}.yaml"
    if not source.is_file():
        parser.error(f"no such zone file: {source}")
    text = source.read_text(encoding="utf-8")
    specs = parse_laser_specs(text, str(source))
    raw = yaml.safe_load(text)

    rewrite = field_pv_rewrite(raw)

    db = Db()
    db.comment("EPICS database for the L4 OPCPA panel — GENERATED, DO NOT EDIT.")
    db.comment()
    db.comment(f"    python ioc/generate.py --zone {args.zone}")
    db.comment()
    db.comment(f"Source: config/zones/{args.zone}.yaml")
    db.comment(f"Lasers: {', '.join(spec.laser for spec in specs)}")
    db.comment()
    db.comment("Injected faults, so the panel's alarm paths are exercised from the")
    db.comment("first page load (see INJECTED_FAULTS in the generator):")
    db.comment("  * chiller 2 outlet temperature runs above HIHI  -> MAJOR")
    db.comment("  * chiller 3 water level is never processed      -> INVALID / UDF")
    db.comment("  * the last MSS permission is denied (ZSV MINOR) -> MINOR, reads NO")
    db.comment("  * one module reports error code 0021            -> ERR is not 0/n")
    db.comment("  * two flashlamp channels sit in STOP            -> tally is not all SB")
    if rewrite:
        db.comment()
        db.comment("Renamed for this IOC. Each of these " + FIELD_PVS_NOTE + ",")
        db.comment("which EPICS base does not have, so it is served as a plain `bi`")
        db.comment("record under a colon-separated name:")
        for original, served in sorted(rewrite.items()):
            db.comment(f"  {original}  ->  {served}")
    db.comment()
    db.comment(f"Records scan at {SCAN}; analogue readouts random-walk inside their band.")
    db.comment()
    db.comment("Lasers that watch the same site-wide PV (an MSS interlock, say) share")
    db.comment("one record — it is defined here once and read by all of them.")

    for spec in specs:
        build_laser(db, spec, rewrite)

    args.db.parent.mkdir(parents=True, exist_ok=True)
    args.db.write_text(db.render(), encoding="utf-8")

    zone_path = ROOT / "config" / "zones" / f"{IOC_ZONE}.yaml"
    rewritten = rewrite_zone(yaml.safe_load(text), rewrite)
    header = [
        f"# GENERATED by ioc/generate.py --zone {args.zone} — DO NOT EDIT.",
        "#",
        f"# The `{args.zone}` zone with the PVs that name a synApps record field",
        "# pointed at the base records the local IOC serves instead:",
        "#",
    ]
    header += [f"#   {original}  ->  {served}" for original, served in sorted(rewrite.items())]
    header += [
        "#",
        "# Everything else is identical, so what the panel renders here is what it",
        f"# renders against the `{args.zone}` zone in the hall.",
        "",
    ]
    zone_path.write_text(
        "\n".join(header) + yaml.safe_dump(rewritten, sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )

    print(f"{_short(args.db)}: {len(db.names)} records")
    if db.shared:
        print(f"  {len(db.shared)} PV(s) shared between lasers, emitted once:")
        for name in sorted(db.shared):
            print(f"    {name}")
    print(f"{_short(zone_path)}: zone for ZONE_CODE={IOC_ZONE}")
    for original, served in sorted(rewrite.items()):
        print(f"  renamed {original} -> {served}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
