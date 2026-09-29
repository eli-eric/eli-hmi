"""The `laser-panel` component's YAML block: one laser.

Ported from the React app's zod schema (`config/schema.ts`), and the format is
unchanged where it can be — the strings a controls engineer wrote for the React
page paste straight in, under a `component: laser-panel` heading.

What the schema still guarantees, because each rule caught a real edit mistake:

* unknown keys are rejected, naming the keys that would have worked;
* a command target is either the placeholder (value == key) or a full PV name
  containing ':' — `ALIGNMENT_MODE: SetAlignmentMode` was a typo that used to
  reach the write path verbatim;
* `SET_DELAY` / `LOAD_WAVEFORM` may not configure a `value`, because the
  operator supplies it and a configured one would never be written;
* two signals pointing at the same PV are rejected (copy a block, forget to
  change the name).

The config holds the **full PV name** for every signal — exactly the strings the
controls team provides. Nothing is assembled from prefixes. The one exception is
the **command PV** (`CMD_<laser>_<NAME>`), because a command maps to a
coordinated sequence of writes dispatched by the control system, not to a single
record.
"""

from __future__ import annotations

from typing import Annotated, Any, Mapping

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from core.components import ComponentConfig
from components.common import ValueText
from core.render import ValueFormatOptions, parse_format

from .commands import (
    LASER_COMMANDS,
    OPERATOR_VALUED_COMMANDS,
    CommandTarget,
    command_pv,
)

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


class ChillerSpec(Strict):
    label: Name
    flow: Name
    temp: Name
    level: Name


class LaserPvs(Strict):
    connection: Name
    full_power: Name = Field(alias="fullPower")
    shutter: Name
    phd_mean: Name = Field(alias="phdMean")
    regen_state: Name = Field(alias="regenState")
    regen_temp: Name = Field(alias="regenTemp")
    phd2_mean: Name = Field(alias="phd2Mean")
    attenuator: Name
    loaded_waveform: Name = Field(alias="loadedWaveform")
    latest_waveform: Name | None = Field(default=None, alias="latestWaveform")
    modbox_mbc1: Name | None = Field(default=None, alias="modboxMbc1")
    modbox_mbc2: Name | None = Field(default=None, alias="modboxMbc2")
    sequencer_running: Name | None = Field(default=None, alias="sequencerRunning")

    def all_names(self) -> list[str]:
        return [value for value in self.model_dump().values() if value]


#: The signal roles `units:` and `format:` are keyed by. Roles rather than PV
#: names: PV names are exactly what differs between stations, whereas a role
#: means the same thing everywhere.
SIGNAL_ROLES: tuple[str, ...] = (
    "phdMean",
    "phd2Mean",
    "regenTemp",
    "attenuator",
    "modboxMbc1",
    "modboxMbc2",
    "triggerDelay",
    "chillerFlow",
    "chillerTemp",
    "chillerLevel",
)


def _check_roles(raw: Mapping[str, Any] | None, block: str) -> dict[str, Any]:
    if raw is None:
        return {}
    unknown = sorted(set(raw) - set(SIGNAL_ROLES))
    if unknown:
        raise ValueError(
            f"{block}: unknown signal role(s) {', '.join(unknown)} "
            f"(known: {', '.join(SIGNAL_ROLES)})"
        )
    return dict(raw)


def _check_unit_labels(raw: Mapping[str, str] | None) -> None:
    """A whitespace-only unit is a slip, not an instruction to render a blank
    one — `resolve_units` would silently fall through and the config author
    would never learn their edit did nothing.
    """
    for role, unit in (raw or {}).items():
        if not isinstance(unit, str) or not unit.strip():
            raise ValueError(f"units.{role}: must be a non-empty label")


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
        "Code 0000 means no error.",
    )
    chillers: list[ChillerSpec] = Field(
        description="Chillers. An empty list hides the Chillers section."
    )
    flashlamps: list[LabeledPv] = Field(
        description="Flashlamp channels (label + state PV). An empty list hides "
        "the Flashlamps section."
    )
    modbox: list[MappedPv] = Field(
        description="Modbox state indicators. An empty list hides the Modbox section."
    )
    delay_presets: list[int] = Field(
        alias="delayPresets",
        description="Trigger-delay presets (ns) offered by the Set Trigger Delay "
        "control.",
    )
    units: dict[str, str] | None = Field(
        default=None,
        description="Engineering units per signal role (phdMean, regenTemp, "
        "chillerFlow, …). The config wins over the PV's own EGU field.",
    )
    format: dict[str, Any] | None = Field(
        default=None,
        description="Display format per signal role: decimal places, or a "
        "{format: exponential|precision|fixed|raw, …} block.",
    )
    commands: dict[str, Any] = Field(
        description="Commands this laser exposes, as SYMBOL: <write PV> or "
        "SYMBOL: {pv, value}. A missing key hides the button — there is no "
        "fail-open default. A placeholder (the value equal to the key) falls "
        "back to CMD_<laser>_<SYMBOL>.",
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

    @field_validator("units")
    @classmethod
    def _units_roles(cls, value: dict[str, str] | None) -> dict[str, str] | None:
        if value is None:
            return None
        checked = _check_roles(value, "units")
        _check_unit_labels(checked)
        return checked

    # -- what the component asks of its config -----------------------------

    @property
    def laser(self) -> str:
        return self.id

    def can(self, command: str) -> bool:
        """Is this command exposed? A button for a command not listed is hidden.

        No fail-open default: an omission can never silently re-enable a
        control.
        """
        return command in self.commands

    def unit(self, role: str) -> str | None:
        return (self.units or {}).get(role)

    def value_format(self, role: str) -> ValueFormatOptions | None:
        return parse_format((self.format or {}).get(role))

    def resolve_command(self, command: str) -> CommandTarget:
        """Where a command's write goes and what it writes.

        The YAML override if there is one, else the code-built
        `CMD_<laser>_<NAME>` triggered with `1`. A placeholder (the value equal
        to the key) means "no real PV yet" and falls back to the same thing.
        """
        target = (self.commands or {}).get(command)
        if target is not None:
            pv, value = _split_target(command, target)
            if pv != command:
                return CommandTarget(pv_name=pv, value=1 if value is None else value)
        return CommandTarget(pv_name=command_pv(self.id, command), value=1)

    @property
    def command_names(self) -> tuple[str, ...]:
        return tuple(self.commands or {})

    @field_validator("format")
    @classmethod
    def _format_roles(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        if value is None:
            return None
        checked = _check_roles(value, "format")
        for role, raw in checked.items():
            try:
                parse_format(raw)
            except ValueError as exc:
                raise ValueError(f"format.{role}: {exc}") from exc
        return checked

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
        names += [item.pv for item in self.modbox]

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


