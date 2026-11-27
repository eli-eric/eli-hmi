"""The `laser-panel` component's YAML block: one laser.

Ported from the React app's zod schema (`config/schema.ts`), and the two are
kept in step — the strings a controls engineer wrote for the React page paste
straight in, under a `component: laser-panel` heading.

One signal is configured in one place. A `pvs:` entry is either the PV on its
own or the PV with what the panel should do with it::

    pvs:
      connection: $(P):PortControl.CNCT           # shorthand: just the PV
      phdMean:
        pv: $(P):PHD1K000:12:Mean
        label: PHD1K000:12/Mean                   # what the row is called
      regenTemp:
        pv: $(P):TK6:44:DisplayTemperature
        format: 1                                 # display rounding only

There is no `units:`, `format:` or `labels:` block: they were three parallel
maps keyed by role, which put one readout in four places and in two
vocabularies — the bias row's PVs were `modboxMbc1/2` while its label was
`biasValue`. What a reading is measured in, and the rounding that follows from
the record rather than from local taste, are the component's (`UNIT_DEFAULTS`,
`FORMAT_DEFAULTS`); a config written the old way is refused by name.

What the schema still guarantees, because each rule caught a real edit mistake:

* unknown keys are rejected, naming the keys that would have worked;
* a command target is either the placeholder (value == key) or a full PV name
  containing ':' — `ALIGNMENT_MODE: SetAlignmentMode` was a typo that used to
  reach the write path verbatim;
* `SET_DELAY` / `LOAD_WAVEFORM` may not configure a `value`, because the
  operator supplies it and a configured one would never be written;
* two signals pointing at the same PV are rejected (copy a block, forget to
  change the name).

Every signal is a **PV name** as the controls team provides it. A laser's
names share its prefix, so a zone says it once, `macros: {P: L4-OPCPA-NL2}`,
and writes `$(P):FullPower`. That is the zone loader's doing (`core/macros.py`)
and done before this config is read, so every field here holds a full name. A
name without `$(P)` is a full name too: the MSS PVs live elsewhere.

Four kinds of name are assembled here rather than written. The **command PV**
(`CMD_<laser>_<NAME>`), because a command maps to a coordinated sequence of
writes dispatched by the control system, not to a single record. A **module's
registers** (`$(P):<label>:<name>`), because a module repeats the same set on
every laser and is labelled with its device. **Everything of the ModBox**
(`$(P):ModBox:<suffix>`): the panel's Modbox section and the ModBox register
view, because every ModBox is the same device, so `modbox: true` says it all
and the suffixes are the component's (`modbox.py`). And the **non-volatile
write arm**
(`$(P):UseNVMemory`), which is the device's own name on every laser.
"""

from __future__ import annotations

from functools import cached_property
from typing import Annotated, Any, Mapping

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from core.components import ComponentConfig, PvKind
from components.common import Exclusive, ValueText
from core.render import ValueFormatOptions, parse_format

from .commands import (
    COMMAND_VALUES,
    LASER_COMMANDS,
    OPERATOR_VALUED_COMMANDS,
    CommandTarget,
    command_pv,
)
from .modbox import READINGS as MODBOX_READINGS, STATE_ROWS as MODBOX_STATE_ROWS

# `.strip()` before the length check so a whitespace-only string — a common
# copy/paste slip — is rejected rather than subscribing to an empty PV.
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True, frozen=True)


class LabeledPv(Strict):
    label: Name
    pv: Name


class MappedPv(LabeledPv):
    """A labelled PV whose raw value is translated for display: `{0: OFF, 1: ON}`.

    The wording is config, not code: what a bit means is domain knowledge that
    belongs beside the PV, and no single pair fits all of them (a Modbox
    subsystem is ON/OFF, a software key ENABLED/DISABLED, an MSS interlock
    YES/NO). Keys match the value converted to a string, so an enum index works
    too. An unmapped value falls through to its raw form rather than
    disappearing.
    """

    values: ValueText | None = None


class Register(Strict):
    """One register of one module.

    Named relative to its module rather than in full: a module repeats the
    same register set on every laser, so the names are the part worth writing
    once, and the laser's `$(P)` and the module's label are the parts that
    differ. `pv` is derived, never
    configured, which is why a tree of hundreds cannot drift from the device
    one typo at a time.

    A real zone declares `name`, `label`, `kind` where it is not a plain
    reading, `write`, and `nv` for the registers that take a non-volatile
    write. **`units`, `states` and `range` are not needed and should be left
    out**: everything they describe is in the record's control fields — its
    EGU, its state strings (ZRST… for an mbbi, ZNAM/ONAM for a bi), its
    DRVL/DRVH — and those are read from the device: the unit at start-up and
    whenever a channel comes back, the states and limits when the register is
    selected to be written. The three exist here only so the simulator and the
    local IOC have something to answer those reads with.

    What a register *is* (`kind`) is the one thing that is declared, because
    it decides the datatype the register is monitored at, and that has to be
    right before the first reading arrives.
    """

    name: Name = Field(description="Register name under its module: $(P):<label>:<name>.")
    label: Name | None = Field(default=None, description="What the row reads.")
    units: Name | None = Field(
        default=None,
        description="Engineering unit, for the simulator and the local IOC "
        "only: it is what they answer a control-field read with. The row shows "
        "the record's own EGU. Omit it in a real zone.",
    )
    write: bool = Field(
        default=False,
        description="True for a setpoint. The write goes to this register's "
        "own PV with ':W' appended — the device's convention, derived rather "
        "than configured so a write target cannot be mistyped.",
    )
    nv: bool = Field(
        default=False,
        description="True if this register can be written to non-volatile "
        "memory. The laser's $(P):UseNVMemory is what arms it.",
    )

    #: What the register *is*. One word, and everything downstream follows
    #: from it: the datatype the register is monitored at, the readout its row
    #: is drawn with, whether its write panel is a field or a list of states,
    #: and the record the generated IOC emits for it.
    kind: PvKind = Field(
        default="float",
        description="float | int | bool | enum | string. Declared, not "
        "discovered: it chooses the datatype the register is monitored at, "
        "and that has to be right before the first reading arrives. `enum` "
        "and `bool` (an mbbi/bi — anything with named states) are read by "
        "name, `float` and `int` as a number whatever record the device used, "
        "`string` as a string. Most registers are analogue readings, so "
        "`float` is the default.",
    )
    states: list[Name] = Field(
        default_factory=list,
        description="State names in index order, for `enum` and `bool`. Only "
        "the local IOC and the simulator use them — the real record supplies "
        "its own, read when the register is selected.",
    )
    range: tuple[float, float] | None = Field(
        default=None,
        description="Engineering range [low, high]. Only the local IOC and "
        "the simulator use it: it is the band a simulated reading drifts "
        "inside and the DRVL/DRVH the generated record carries. NOT the "
        "limits a write is held to — those are the device's own control "
        "fields, read when the register is selected. Omit it in a real zone.",
    )
    value: Any = Field(default=None, description="Value at rest.")

    #: Set when the laser is validated, from its `$(P)` and the module's
    #: label. Given in full only by the ModBox's fixed table (`modbox.py`),
    #: whose sections are not device ids.
    pv: str = Field(default="", description="Derived: $(P):<module label>:<name>.")

    @property
    def write_pv(self) -> str:
        """Where a setpoint is written: the register's own record with ':W'.

        The device's convention, derived rather than configured — a write
        target spelled out per register is a write that can be mistyped into
        another device's record.
        """
        return f"{self.pv}:W"


class Module(Strict):
    """One device module and the registers under it.

    Called what the device is (`PS1225:11`), because that is also the part of
    the name it adds: its registers are `$(P):<label>:<name>`, named when the
    laser is validated. Nothing else to configure, so a module cannot hang
    off another laser's prefix by a copy-paste.
    """

    label: Name = Field(
        description="The device, e.g. PS1225:11: what the tree calls the module "
        "and the part of each register's name after the laser's $(P)."
    )
    registers: list[Register] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def _no_prefix(cls, raw: Any) -> Any:
        if isinstance(raw, Mapping) and "prefix" in raw:
            raise ValueError(
                "prefix: no longer used — a module's registers are named "
                "$(P):<label>:<name>, from the laser's `macros: {P: ...}`"
            )
        return raw


class SequenceSpec(Strict):
    """One sequence the control system can run, as the Sequencer row lists it.

    A real device needs only the name and the PV: its control system sets that
    PV while the sequence runs, and the panel reads it. `command` is for the
    deployments that have no control system — the simulator and the local IOC —
    where nothing would otherwise move the PV; it names the button whose press
    should hold this sequence at RUNNING. Omit it everywhere else.
    """

    label: Name = Field(description="Sequence name, e.g. 'Start Laser'.")
    pv: Name = Field(description="This sequence's state PV (1 = RUNNING).")
    command: Name | None = Field(
        default=None,
        description="Simulator and local IOC only: the command whose press "
        "holds this sequence at RUNNING. A real control system does that "
        "itself, so a real zone leaves this out.",
    )


class ChillerSpec(Strict):
    label: Name
    flow: Name
    temp: Name
    level: Name


class LaserPvs(Strict):
    """The laser's single-signal PVs.

    The optional ones are optional because a laser may not have the hardware:
    omit `phd2Mean` on a laser with one photodiode, or `shutter` on one with
    no shutter, and the row goes with it. A row naming a device that is not
    there is worse than no row.

    The Modbox's four readings are here because labels, units and rounding
    are keyed by role, but no zone writes them: `modbox: true` names them
    `$(P):ModBox:<suffix>` (`modbox.py`).
    """

    connection: Name
    full_power: Name = Field(alias="fullPower")
    shutter: Name | None = None
    phd_mean: Name = Field(alias="phdMean")
    regen_state: Name = Field(alias="regenState")
    regen_temp: Name = Field(alias="regenTemp")
    phd2_mean: Name | None = Field(default=None, alias="phd2Mean")
    attenuator: Name
    loaded_waveform: Name | None = Field(default=None, alias="loadedWaveform")
    latest_waveform: Name | None = Field(default=None, alias="latestWaveform")
    modbox_mbc1: Name | None = Field(default=None, alias="modboxMbc1")
    modbox_mbc2: Name | None = Field(default=None, alias="modboxMbc2")


    def all_names(self) -> list[str]:
        return [value for value in self.model_dump().values() if value]


class SignalOptions(Strict):
    """How one signal is presented, beside the PV it is presented from.

    A reading is one thing, so it is configured in one place: the row's wording,
    its rounding and its unit live in the same `pvs:` entry as the name they
    describe. They used to be three parallel blocks keyed by role, which meant
    four places to look for one readout and two vocabularies to keep in step.
    """

    label: Name | None = Field(
        default=None,
        description="What this row is called. Defaults to the reference "
        "laser's wording, which names NL2's hardware — set it on every laser "
        "whose device ids differ.",
    )
    units: Name | None = Field(
        default=None,
        description="Engineering unit. Rarely needed: the component knows what "
        "each reading is measured in and the record's own EGU wins over that. "
        "This is the correction for a device reporting the wrong one.",
    )
    format: Any = Field(
        default=None,
        description="Display rounding: decimal places, or a {format: "
        "exponential|precision|fixed|raw, …} block. Display only — it never "
        "changes what is written.",
    )


#: What each row is called, and what it is called when a laser says nothing.
#:
#: NL2 was the reference while this panel was built, so its device ids ended up
#: printed in the template — a second laser with different modules had no way
#: to say so. Keyed by role for the same reason `units:` is: a role means the
#: same thing at every station, while the name of the device does not.
#: Keyed by the `pvs:` role whose entry can override it, because a row backed
#: by one PV is named where that PV is named.
LABEL_DEFAULTS: dict[str, str] = {
    "shutter": "Shutter Position",
    "phdMean": "PHD1K000:49/Mean",
    "regenState": "Regen SY3PL50M:32",
    "regenTemp": "Regen Temp TK6:44",
    "phd2Mean": "PHD1K000:48/Mean",
    "attenuator": "Atten. SM5:ATT1:51",
    "loadedWaveform": "Waveform Preset",
    "latestWaveform": "Waveform Latest",
}

#: What the template calls each nameable row, and the `pvs:` role whose entry
#: renames it. They differ for three rows whose PV is named after the record
#: rather than after what the row shows.
ROW_LABELS: dict[str, str] = {
    "shutter": "shutter",
    "phdMean": "phdMean",
    "regenState": "regenState",
    "regenTemp": "regenTemp",
    "phd2Mean": "phd2Mean",
    "attenuator": "attenuator",
    "waveformPreset": "loadedWaveform",
    "waveformLatest": "latestWaveform",
}

#: Rows that name a cluster rather than a device: an overview of four cells, a
#: tally of flashlamps, the Modbox's own state. No laser's hardware appears in
#: them, so they are the component's words and not configuration.
FIXED_LABELS: dict[str, str] = {
    "sequencer": "Sequencer",
    "overview": "Overview",
    "flashlampsState": "Flashlamps State",
    "triggerDelay": "Trigger Delay",
    "modboxState": "Modbox State",
    "biasValue": "Bias Value MBC1 | MBC2",
}

#: What each reading is measured in. Intrinsic to the signal, not to the
#: station: every zone's config carried the same five lines before this.
#: A record's own EGU still wins — this is what shows when it has none.
UNIT_DEFAULTS: dict[str, str] = {
    "regenTemp": "°C",
    "triggerDelay": "ns",
    "modboxMbc1": "mV",
    "modboxMbc2": "mV",
    "chillerFlow": "l/min",
    "chillerTemp": "°C",
    "chillerLevel": "%",
}

#: Rounding that follows from what the record is, rather than from local taste:
#: a bias controller reports whole millivolts. Anything absent here renders at
#: the shared default.
FORMAT_DEFAULTS: dict[str, Any] = {
    "modboxMbc1": 0,
    "modboxMbc2": 0,
    # A thousandth of a millijoule, which is what the detector resolves. Stated
    # rather than left to the shared default it currently equals: this is the
    # reading an operator compares shot to shot, so what it rounds to is this
    # component's business and should not move if that default ever does.
    "phdMean": 3,
    "phd2Mean": 3,
    # A chiller cell is ~3.9rem wide, so every digit has to earn its place:
    # a loop temperature is read to a hundredth, and a water level is a whole
    # percent — a thousandth of one is three characters of noise.
    "chillerTemp": 2,
    "chillerLevel": 0,
    # Two decimals, not the shared three: more digits than a regen loop's
    # sensor can mean, and a station reading 22.456 invites a conclusion about
    # the third one.
    "regenTemp": 2,
}


def _split_target(command: str, target: Any) -> tuple[str, Any]:
    """The PV and the configured value of either command-target form.

    A command is either a bare PV name (`MODBOX_ON: L4-…:Mode`, written with the
    conventional `1`) or `{pv, value}` when the device wants something else —
    `MODBOX_OFF: {pv: L4-…:ModBox:Awake, value: Sleep}`.
    """
    if isinstance(target, str):
        return target.strip(), None
    if isinstance(target, Mapping):
        unknown = sorted(set(target) - {"pv", "value"})
        if unknown:
            raise ValueError(f"commands.{command}: unknown key(s) {', '.join(unknown)}")
        pv = target.get("pv")
        if not isinstance(pv, str) or not pv.strip():
            raise ValueError(f"commands.{command}: missing 'pv'")
        value = target.get("value")
        if value is not None and (
            isinstance(value, bool)
            or not isinstance(value, (str, int, float))
            or (isinstance(value, str) and not value.strip())
        ):
            # Whatever is here is handed to `caput`. A list or a mapping would
            # fail at the Channel Access layer, long after the config was
            # reviewed.
            raise ValueError(
                f"commands.{command}: value must be a non-empty string or a number"
            )
        return pv.strip(), value.strip() if isinstance(value, str) else value
    raise ValueError(f"commands.{command}: must be a PV name or {{pv, value}}")


class Config(ComponentConfig):
    id: Name = Field(
        description="Laser id, e.g. NL2. The panel heading, the component's key, "
        "and the <LASER> in command PVs (CMD_<id>_<NAME>)."
    )
    pvs: LaserPvs = Field(description="The single-signal read/write PVs; see LaserPvs.")
    trigger_delay: list[Name] = Field(
        alias="triggerDelay",
        min_length=1,
        description="Trigger-delay readout PVs. They should all read equal; a "
        "mismatch is flagged on the panel, because nothing else can report it.",
    )
    mss: list[MappedPv] = Field(
        description="MSS sub-indicators (label + PV, optional per-value text) "
        "counted in the General overview."
    )
    module_errors: list[LabeledPv] = Field(
        alias="moduleErrors",
        description="Module-error indicators (label + PV) counted in the overview. "
        "Numeric status codes; which of them is a fault is the IOC's to say, so "
        "the overview counts the ones it has alarmed rather than reading the "
        "codes itself.",
    )
    chillers: list[ChillerSpec] = Field(
        description="Chillers. An empty list hides the Chillers section."
    )
    flashlamps: list[LabeledPv] = Field(
        description="Flashlamp channels (label + state PV). An empty list hides "
        "the Flashlamps section."
    )
    modules: list[Module] = Field(
        default_factory=list,
        description="The laser's device modules and their registers — the "
        "tree behind the panel's own rows. Omitted or empty means this laser "
        "offers no register view.",
    )
    sequences: list[SequenceSpec] = Field(
        default_factory=list,
        description="Sequences this laser can run (label + state PV). Omitted "
        "or empty hides the Sequencer section. The row above them reads "
        "RUNNING while any of them does.",
    )
    modbox: bool = Field(
        default=False,
        description="Whether the laser has a Modbox. True shows the whole Modbox "
        "section — its state list, bias, waveform preset and last-sent waveform "
        "— and its ModBox register view, every name $(P):ModBox:<suffix>: every "
        "ModBox is the same device, so the rows are the component's "
        "(`modbox.py`). False, the default, means no section at all.",
    )
    delay_presets: list[int] = Field(
        alias="delayPresets",
        description="Trigger-delay presets (ns) offered by the Set Trigger Delay "
        "control.",
    )
    signals: dict[str, SignalOptions] = Field(
        default_factory=dict,
        description="Not written directly: this is what each `pvs:` entry says "
        "about itself once its PV name has been taken out of it.",
    )
    commands: dict[str, Any] = Field(
        description="Commands this laser exposes, as SYMBOL: <write PV> or "
        "SYMBOL: {pv, value}. A missing key hides the button — there is no "
        "fail-open default. A placeholder (the value equal to the key) falls "
        "back to CMD_<laser>_<SYMBOL>.",
    )
    waveforms_url: str | None = Field(
        default=None,
        alias="waveformsUrl",
        description="Absolute URL of the Modbox's own waveform catalog, e.g. "
        "https://modbox-nl2.lcs.local/api/waveforms. Served by the device, so it "
        "differs per laser; the server fetches it and expects a JSON array of "
        "names. Set it and `waveforms` below is ignored.",
    )
    waveforms: list[str] = Field(
        default_factory=lambda: [
            "std-100ps",
            "narrow-50ps",
            "broad-200ps",
            "super-gauss",
            "ramp-up",
        ],
        description="Waveform presets the Modbox control offers. Served with the "
        "page rather than fetched: the list changes when the machine is "
        "reconfigured, not while an operator is looking at it.",
    )
    exclusive: Exclusive = Field(
        default=True,
        description="Whether the laser is under control: one tab at a time may "
        "use any of its controls, its registers' setpoints included "
        "(`core.locks`). On by default; `false` leaves the whole laser out.",
    )

    @model_validator(mode="before")
    @classmethod
    def _modbox_is_the_components(cls, raw: Any) -> Any:
        """`modbox: true` names the section's readings; no zone writes them.

        Refused rather than ignored: the old list, or a reading left in
        `pvs:`, would read as if it were what the section shows. A reading
        equal to the one `modbox: true` gives is let through, which is what a
        config dumped and validated again looks like.
        """
        if not isinstance(raw, Mapping):
            return raw
        if isinstance(raw.get("modbox"), list):
            raise ValueError(
                "modbox: now `modbox: true` — the section's rows and readings are "
                "the component's (modbox.py), each named $(P):ModBox:<suffix>"
            )
        prefix = (raw.get("macros") or {}).get("P") if isinstance(raw.get("macros"), Mapping) else None
        has_modbox = raw.get("modbox") is True
        pvs = raw.get("pvs")
        if not isinstance(pvs, Mapping):
            return raw
        derived = (
            {role: f"{prefix}:ModBox:{suffix}" for role, suffix in MODBOX_READINGS.items()}
            if has_modbox and prefix
            else {}
        )
        for role, suffix in MODBOX_READINGS.items():
            if role in pvs and pvs[role] != derived.get(role):
                raise ValueError(
                    f"pvs.{role}: not configured — `modbox: true` names it "
                    f"$(P):ModBox:{suffix}"
                )
        if not derived:
            return raw
        return {**raw, "pvs": {**pvs, **derived}}

    @model_validator(mode="before")
    @classmethod
    def _prefix_is_a_macro(cls, raw: Any) -> Any:
        """The laser's prefix is its `$(P)`, said once in `macros:`.

        Refused rather than ignored: a `prefix:` left in a file would read as
        if it still named the ModBox.
        """
        if isinstance(raw, Mapping) and "prefix" in raw:
            raise ValueError(
                f"prefix: no longer used — write `macros: {{P: {raw['prefix']}}}`; "
                "the ModBox's registers are named $(P):ModBox:<suffix>"
            )
        for key in ("nvWrite", "nv_write"):
            if isinstance(raw, Mapping) and key in raw:
                raise ValueError(
                    f"{key}: no longer used — a non-volatile write is armed at "
                    "$(P):UseNVMemory on every laser whose registers declare `nv: true`"
                )
        return raw

    @model_validator(mode="before")
    @classmethod
    def _split_signals(cls, raw: Any) -> Any:
        """`pvs: {role: name}` or `pvs: {role: {pv, label, units, format}}`.

        The second form is the one that matters and the first is its shorthand,
        for the signals a laser has nothing to say about. Everything but the
        name is lifted out here, so the rest of the component still reads
        `cfg.pvs.phd_mean` and gets a PV name.
        """
        if not isinstance(raw, Mapping) or not isinstance(raw.get("pvs"), Mapping):
            return raw
        names: dict[str, Any] = {}
        options: dict[str, Any] = {}
        for role, entry in raw["pvs"].items():
            if isinstance(entry, Mapping):
                entry = dict(entry)
                pv = entry.pop("pv", None)
                if pv is None:
                    raise ValueError(f"pvs.{role}: missing 'pv'")
                names[role] = pv
                options[role] = entry
            else:
                names[role] = entry
        if not options:
            return raw
        return {**raw, "pvs": names, "signals": options}

    @field_validator("signals")
    @classmethod
    def _signal_roles(cls, value: dict[str, SignalOptions]) -> dict[str, SignalOptions]:
        """A signal may only say something about a row the panel has.

        `pvs:` itself rejects an unknown role, so this catches the subtler one:
        a label on a reading that has no row of its own (a trigger-delay
        channel, a command target), which would be written and never shown.
        """
        for role, options in value.items():
            if options.label is not None and role not in LABEL_DEFAULTS:
                raise ValueError(
                    f"pvs.{role}: this row's name is the component's "
                    f"({FIXED_LABELS.get(role, 'not a row of its own')}), not a "
                    f"laser's. Nameable: {', '.join(sorted(LABEL_DEFAULTS))}"
                )
        return value

    # -- what the component asks of its config -----------------------------

    @property
    def laser(self) -> str:
        return self.id

    @property
    def prefix(self) -> str | None:
        """The laser's PV prefix: its `$(P)`, e.g. L4-OPCPA-NL2.

        Most of the laser's names are written with it, which `macros:` takes
        care of before this config is read. What is left is what the YAML
        never spells: the ModBox's registers, `<P>:ModBox:<suffix>`.
        """
        return self.macros.get("P")

    @cached_property
    def modbox_rows(self) -> list[MappedPv]:
        """The Modbox section's state rows, `$(P):ModBox:<suffix>` each, or
        none for a laser without one."""
        if not (self.modbox and self.prefix):
            return []
        return [
            MappedPv(label=label, pv=f"{self.prefix}:ModBox:{suffix}")
            for label, suffix in MODBOX_STATE_ROWS
        ]

    @property
    def nv_write(self) -> str | None:
        """The PV that arms a non-volatile write: `$(P):UseNVMemory`.

        The device's own name for it, the same on every laser. None when no
        register declares `nv: true`: the box is only shown beside a register
        that takes an NV write, so without one it would be a PV monitored for
        nobody.
        """
        takes_nv = any(r.nv for module in self.modules for r in module.registers)
        return f"{self.prefix}:UseNVMemory" if takes_nv and self.prefix else None

    def can(self, command: str) -> bool:
        """Is this command exposed? A button for a command not listed is hidden.

        No fail-open default: an omission can never silently re-enable a
        control.
        """
        return command in self.commands

    def label(self, role: str) -> str:
        """What this laser calls the given row, falling back to the default.

        `role` is the `pvs:` key for a row backed by one PV, and one of
        `FIXED_LABELS` for a row that names a cluster instead.
        """
        configured = self.signals.get(role)
        if configured is not None and configured.label:
            return configured.label
        return LABEL_DEFAULTS.get(role) or FIXED_LABELS[role]

    def row_labels(self) -> dict[str, str]:
        """Every row name the template asks for: the laser's where it said one,
        the component's where it did not."""
        return {
            **FIXED_LABELS,
            **{row: self.label(role) for row, role in ROW_LABELS.items()},
        }

    def unit(self, role: str) -> str | None:
        """The configured unit if a device reports the wrong one, else the
        component's. The record's own EGU sits between the two and is applied
        by `resolve_units` at the call site."""
        configured = self.signals.get(role)
        if configured is not None and configured.units:
            return configured.units
        return None

    def default_unit(self, role: str) -> str | None:
        """What the component says this reading is measured in."""
        return UNIT_DEFAULTS.get(role)

    def shown_unit(self, role: str) -> str | None:
        """The unit for somewhere there is no reading to ask — a column header.
        Beside a value, `resolve_units` slots the record's own EGU between
        these two.
        """
        return self.unit(role) or self.default_unit(role)

    def value_format(self, role: str) -> ValueFormatOptions | None:
        configured = self.signals.get(role)
        raw = configured.format if configured is not None else None
        if raw is None:
            raw = FORMAT_DEFAULTS.get(role)
        return parse_format(raw)

    def resolve_command(self, command: str) -> CommandTarget:
        """Where a command's write goes and what it writes.

        The YAML override if there is one, else the code-built
        `CMD_<laser>_<NAME>`. A placeholder (the value equal to the key) means
        "no real PV yet" and falls back to the same thing. Written with `1`,
        the trigger convention, unless the YAML gives a value or the command
        has its own (`COMMAND_VALUES`: "50 + Close" writes 50).
        """
        default = COMMAND_VALUES.get(command, 1)
        target = (self.commands or {}).get(command)
        if target is not None:
            pv, value = _split_target(command, target)
            if pv != command:
                return CommandTarget(pv_name=pv, value=default if value is None else value)
        return CommandTarget(pv_name=command_pv(self.id, command), value=default)

    @property
    def command_names(self) -> tuple[str, ...]:
        return tuple(self.commands or {})

    @field_validator("signals")
    @classmethod
    def _signal_formats(cls, value: dict[str, SignalOptions]) -> dict[str, SignalOptions]:
        """A format that `parse_format` cannot read is a start-up failure, not
        a `ValueError` raised inside a render while a control room watches."""
        for role, options in value.items():
            try:
                parse_format(options.format)
            except ValueError as exc:
                raise ValueError(f"pvs.{role}.format: {exc}") from exc
        return value

    @field_validator("commands")
    @classmethod
    def _commands_vocabulary(cls, value: dict[str, Any]) -> dict[str, Any]:
        unknown = sorted(set(value) - set(LASER_COMMANDS))
        if unknown:
            raise ValueError(
                f"commands: unknown command(s) {', '.join(unknown)} "
                f"(vocabulary: {', '.join(LASER_COMMANDS)})"
            )
        for command, target in value.items():
            pv, configured_value = _split_target(command, target)
            if pv != command and ":" not in pv:
                raise ValueError(
                    f'commands.{command}: "{pv}" is neither the placeholder '
                    f'"{command}" nor a full PV name (must contain \':\')'
                )
            if configured_value is not None and command in OPERATOR_VALUED_COMMANDS:
                raise ValueError(
                    f"commands.{command}: takes its value from the operator, so "
                    f'"value" here would never be written'
                )
        return value

    @model_validator(mode="after")
    def _modbox_is_whole(self) -> "Config":
        """A Modbox is one device, not a bag of optional rows.

        Either the laser has one — and then it has everything a Modbox has,
        all of it named from its `$(P)` — or it has none and the section is
        absent. There is nothing to half-configure, so the one thing to check
        is that there is a `P` to name it from.
        """
        if self.modbox and not self.prefix:
            raise ValueError(
                "macros: P is required when the laser has a modbox: its "
                "rows and registers are named $(P):ModBox:<suffix>"
            )
        return self

    @model_validator(mode="after")
    def _name_the_registers(self) -> "Config":
        """Every register is `$(P):<module label>:<name>`, derived here so a
        tree of hundreds cannot drift from the device one typo at a time."""
        if self.modules and not self.prefix:
            raise ValueError(
                "macros: P is required when the laser has modules: their "
                "registers are named $(P):<label>:<name>"
            )
        for module in self.modules:
            for register in module.registers:
                object.__setattr__(
                    register, "pv", f"{self.prefix}:{module.label}:{register.name}"
                )
        return self

    @model_validator(mode="after")
    def _no_duplicate_pvs(self) -> "Config":
        """Two signals pointing at one PV is almost certainly a copy-paste typo.

        Design-aligned: it assumes no naming convention, so it cannot catch a
        *wrong but unique* name — only the live system can reveal that as `<>`.
        Two commands may legitimately share a PV when they write different
        values (MODBOX_ON/OFF on one mode record), so a command target is keyed
        by PV *and* value; only an exact repeat counts.
        """
        names: list[str] = list(self.pvs.all_names())
        for command, target in self.commands.items():
            pv, value = _split_target(command, target)
            if pv == command:
                continue  # placeholder, not a PV
            # The shorthand form (`SYSTEM_STANDBY: L4-…:FullPower`) is compared
            # as a bare PV name, so a command pointing at a readout collides
            # with it — which is the copy-paste typo this rule exists for. Only
            # the explicit `{pv, value}` form is keyed by value, because two
            # commands writing different values to one mode record is a
            # legitimate configuration.
            names.append(pv if isinstance(target, str) else f"{pv}\0{1 if value is None else value}")
        names += list(self.trigger_delay)
        names += [item.pv for item in self.mss]
        names += [item.pv for item in self.module_errors]
        for chiller in self.chillers:
            names += [chiller.flow, chiller.temp, chiller.level]
        names += [item.pv for item in self.flashlamps]
        names += [item.pv for item in self.modbox_rows]

        seen: set[str] = set()
        duplicates: list[str] = []
        for name in names:
            if name in seen and name not in duplicates:
                duplicates.append(name)
            seen.add(name)
        if duplicates:
            shown = ", ".join(d.split("\0")[0] for d in duplicates)
            raise ValueError(
                f"laser {self.id}: duplicate PV name(s) — likely a copy-paste typo: {shown}"
            )
        return self


