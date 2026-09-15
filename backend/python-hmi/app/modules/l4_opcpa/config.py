"""Schema + loader for the L4 OPCPA per-laser config
(`config/zones/<ZONE_CODE>.yaml`, one file per zone — ADR-0010 / ADR-0012).

Pydantic port of `app/(modules)/l4-opcpa/config/schema.ts`. The YAML format is
unchanged, deliberately: the same file that drove the React page drives this one,
so a zone can be moved over without an operator editing anything.

What the schema still guarantees, because each rule caught a real edit mistake:

* unknown keys are rejected (`extra="forbid"`, the zod `.strict()`);
* a command target is either the placeholder (value == key) or a full PV name
  containing ':' — `ALIGNMENT_MODE: SetAlignmentMode` was a typo that used to
  reach the write path verbatim;
* `SET_DELAY` / `LOAD_WAVEFORM` may not configure a `value`, because the
  operator supplies it and a configured one would never be written;
* two signals pointing at the same PV are rejected (copy a block, forget to
  change the name).

One schema is the single source for both validation and the objects the view
consumes, as before. The file read is at the bottom so the parse stays testable
from a plain string.
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Any, Mapping

import yaml
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    ValidationError,
    field_validator,
    model_validator,
)

from app.presentation.formatting import ValueFormatOptions, parse_format

from .pv_names import (
    LASER_COMMANDS,
    OPERATOR_VALUED_COMMANDS,
    CommandTarget,
    CommandResolver,
)

logger = logging.getLogger(__name__)

# `.strip()` before the length check so a whitespace-only string — a common
# copy/paste slip — is rejected rather than subscribing to an empty PV.
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class ConfigError(Exception):
    """Operator-readable configuration failure."""


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

    values: dict[str, str] | None = None


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


class RawLaser(Strict):
    id: Name
    pvs: LaserPvs
    trigger_delay: list[Name] = Field(alias="triggerDelay", min_length=1)
    mss: list[MappedPv]
    module_errors: list[LabeledPv] = Field(alias="moduleErrors")
    chillers: list[ChillerSpec]
    flashlamps: list[LabeledPv]
    modbox: list[MappedPv]
    delay_presets: list[int] = Field(alias="delayPresets")
    units: dict[str, str] | None = None
    format: dict[str, Any] | None = None
    commands: dict[str, Any]

    @field_validator("units")
    @classmethod
    def _units_roles(cls, value: dict[str, str] | None) -> dict[str, str] | None:
        if value is None:
            return None
        checked = _check_roles(value, "units")
        _check_unit_labels(checked)
        return checked

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
    def _no_duplicate_pvs(self) -> "RawLaser":
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


class RawConfig(Strict):
    units: dict[str, str] | None = None
    format: dict[str, Any] | None = None
    lasers: list[RawLaser] = Field(min_length=1)

    @field_validator("units")
    @classmethod
    def _units_roles(cls, value: dict[str, str] | None) -> dict[str, str] | None:
        return RawLaser._units_roles(value)

    @field_validator("format")
    @classmethod
    def _format_roles(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        return RawLaser._format_roles(value)

    @model_validator(mode="after")
    def _unique_ids(self) -> "RawConfig":
        seen: set[str] = set()
        for laser in self.lasers:
            if laser.id in seen:
                raise ValueError(f'duplicate laser id "{laser.id}"')
            seen.add(laser.id)
        return self


def _split_target(command: str, target: Any) -> tuple[str, Any]:
    """The PV and the configured value of either command-target form."""
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


class LaserSpec:
    """Resolved per-laser config consumed by the view (`id` renamed to `laser`).

    The raw `commands` map is normalised into two views, as in the React app:
    `commands` (the keys — the visibility gate) and `resolve_command` (a
    resolver; placeholder entries fall back to `CMD_<laser>_<NAME>`).
    """

    __slots__ = (
        "laser",
        "pvs",
        "trigger_delay",
        "mss",
        "module_errors",
        "chillers",
        "flashlamps",
        "modbox",
        "delay_presets",
        "units",
        "format",
        "commands",
        "resolve_command",
    )

    def __init__(self, raw: RawLaser, module_units: dict[str, str], module_format: dict[str, Any]):
        self.laser = raw.id
        self.pvs = raw.pvs
        self.trigger_delay = tuple(raw.trigger_delay)
        self.mss = tuple(raw.mss)
        self.module_errors = tuple(raw.module_errors)
        self.chillers = tuple(raw.chillers)
        self.flashlamps = tuple(raw.flashlamps)
        self.modbox = tuple(raw.modbox)
        self.delay_presets = tuple(raw.delay_presets)
        # Per-laser overrides win over the module-wide defaults.
        self.units: dict[str, str] = {**module_units, **(raw.units or {})}
        merged_format = {**module_format, **(raw.format or {})}
        self.format: dict[str, ValueFormatOptions] = {
            role: options
            for role, raw_options in merged_format.items()
            if (options := parse_format(raw_options)) is not None
        }
        self.commands: tuple[str, ...] = tuple(raw.commands)
        overrides: dict[str, CommandTarget] = {}
        for command, target in raw.commands.items():
            pv, value = _split_target(command, target)
            if pv == command:
                continue  # placeholder — resolver falls back to CMD_<laser>_<NAME>
            overrides[command] = CommandTarget(pv_name=pv, value=1 if value is None else value)
        self.resolve_command = CommandResolver(laser=raw.id, overrides=overrides)

    def can(self, command: str) -> bool:
        """Is this command exposed? A button for a command not listed is hidden.

        No fail-open default: an omission can never silently re-enable a control.
        """
        return command in self.commands

    def unit(self, role: str) -> str | None:
        return self.units.get(role)

    def value_format(self, role: str) -> ValueFormatOptions | None:
        return self.format.get(role)


def parse_laser_specs(text: str, name: str = "laser config") -> list[LaserSpec]:
    """Parse + validate raw YAML text. Raises `ConfigError` with an
    operator-readable message on malformed YAML or a schema violation.
    """
    try:
        data = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise ConfigError(f"{name} is not valid YAML: {exc}") from exc

    try:
        config = RawConfig.model_validate(data)
    except ValidationError as exc:
        raise ConfigError(f"{name} is invalid:\n{_prettify(exc)}") from exc

    module_units = config.units or {}
    module_format = config.format or {}
    return [LaserSpec(laser, module_units, module_format) for laser in config.lasers]


def _prettify(error: ValidationError) -> str:
    lines = []
    for item in error.errors():
        location = ".".join(str(part) for part in item["loc"]) or "(root)"
        lines.append(f"  {location}: {item['msg']}")
    return "\n".join(lines)


def config_root() -> Path:
    """Where the zone files live. `HMI_CONFIG_ROOT` overrides, as in the React
    app's `configRoot()`, so tests and containers can point elsewhere.
    """
    override = os.getenv("HMI_CONFIG_ROOT")
    if override:
        return Path(override)
    return Path(__file__).resolve().parents[3] / "config"


def zone_config_path(zone_code: str) -> Path:
    return config_root() / "zones" / f"{zone_code}.yaml"


@lru_cache(maxsize=8)
def _cached_specs(path: str) -> tuple[LaserSpec, ...]:
    return tuple(parse_laser_specs(Path(path).read_text(encoding="utf-8"), path))


def load_laser_specs(zone_code: str, *, cache: bool = True) -> tuple[LaserSpec, ...]:
    """Read + validate the current zone's laser config.

    Cached for the process lifetime in production, uncached in development, same
    policy as `load-laser-specs.ts` — an engineer editing YAML wants a reload on
    refresh, a container's config is fixed for the image's lifetime.
    """
    if not zone_code:
        raise ConfigError("ZONE_CODE is not set — cannot resolve the L4 OPCPA laser config")
    path = zone_config_path(zone_code)
    if not path.is_file():
        available = sorted(p.stem for p in (config_root() / "zones").glob("*.yaml"))
        raise ConfigError(
            f"No laser config for zone '{zone_code}' at {path}. "
            f"Available zones: {', '.join(available) or 'none'}"
        )
    if cache:
        return _cached_specs(str(path))
    return tuple(parse_laser_specs(path.read_text(encoding="utf-8"), str(path)))


def clear_cache() -> None:
    """Tests and the dev reload path."""
    _cached_specs.cache_clear()
