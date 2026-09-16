"""The pieces every component's YAML shares: how a number is displayed, what a
button writes, what a setpoint offers — and how those turn into PV declarations.

Kept in one place so that `units:`, `format:`, `range:`, `actions:` and
`setpoint:` mean the same thing in every component. A controls engineer who has
configured one component has configured most of them.
"""

from __future__ import annotations

from typing import Annotated, Any, Iterable, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, model_validator

from core.components import ComponentConfig, PvSpec
from core.render import ValueFormatOptions, parse_format


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


def _text_keys(value: Any) -> Any:
    """Let `{0: OFF, 1: ON}` mean what it looks like.

    A raw PV value is matched as text, so the keys are strings — but nobody
    writes `{"0": OFF}` in YAML, and YAML reads unquoted `0` as an integer and
    unquoted `on`/`off` as booleans. Both are stringified here rather than
    rejected, because the alternative is a schema error about key types for a
    mapping that was obviously correct.
    """
    if not isinstance(value, dict):
        return value
    return {
        ("1" if key is True else "0" if key is False else str(key)): text
        for key, text in value.items()
    }


#: Display text per raw value: `{0: OFF, 1: ON}`.
ValueText = Annotated[dict[str, str], BeforeValidator(_text_keys)]


def _good_state(value: Any) -> Any:
    """`good: on` is the boolean True as far as YAML is concerned.

    Mapping it back is worth doing: `good: on` is what an engineer will write,
    and refusing it teaches them that this config has arbitrary rules rather
    than that YAML has a quirk.
    """
    if value is True:
        return "on"
    if value is False:
        return "off"
    return value


GoodState = Annotated[Literal["on", "off", "neither"], BeforeValidator(_good_state)]


# ---------------------------------------------------------------------------
# Writing
# ---------------------------------------------------------------------------


class Action(Strict):
    """One button. Every button on a screen is one of these."""

    label: str = Field(description="Button text.")
    value: Any = Field(description="What is written when it is pressed.")
    pv: str | None = Field(
        default=None,
        description="PV to write. Defaults to the component's own PV, which is "
        "what an Open/Close pair on a readback wants.",
    )
    variant: Literal["primary", "secondary", "danger"] = Field(
        default="primary",
        description="Semantic only — every variant renders identically. A control "
        "room full of green and red buttons trains operators to look at chrome "
        "instead of at readings.",
    )


class Setpoint(Strict):
    """A value the operator supplies: a number with presets, or a choice."""

    label: str = Field(default="Set", description="Label above the input.")
    pv: str | None = Field(
        default=None, description="PV to write. Defaults to the component's own PV."
    )
    presets: list[float] = Field(
        default_factory=list,
        description="Values offered as one-press chips. The list is never "
        "complete, so a free-text field is always there as well.",
    )
    choices: list[str] = Field(
        default_factory=list,
        description="Offer a drop-down of these instead of a number field.",
    )
    step: float = Field(default=1, description="Step of the number field.")

    @model_validator(mode="after")
    def _one_kind(self) -> "Setpoint":
        if self.presets and self.choices:
            raise ValueError("a setpoint takes either `presets` (numbers) or `choices` (strings)")
        return self

    @property
    def is_choice(self) -> bool:
        return bool(self.choices)


# ---------------------------------------------------------------------------
# Displaying
# ---------------------------------------------------------------------------


class Alarm(Strict):
    """EPICS alarm limits.

    Only used when there is no control system to ask: the local IOC puts these
    on the record, so a simulated alarm is a *real* EPICS alarm that arrives
    through the same path as one from the hall. Against the real network the
    IOC's own limits are what matter and these are ignored.
    """

    high: float | None = Field(default=None, description="MINOR above this.")
    hihi: float | None = Field(default=None, description="MAJOR above this.")
    low: float | None = Field(default=None, description="MINOR below this.")
    lolo: float | None = Field(default=None, description="MAJOR below this.")


class Demo(Strict):
    """How this signal behaves when it is simulated. Affects nothing in the hall.

    Worth setting on one or two signals per screen: a screen where nothing is
    ever alarmed never shows an engineer what an alarm looks like, and the state
    an operator most needs to recognise — a reading that cannot be trusted — is
    the one that never happens on demand.
    """

    value: Any = Field(default=None, description="Value at rest.")
    severity: int = Field(
        default=0, ge=0, le=3, description="Force a severity: 1 MINOR, 2 MAJOR, 3 INVALID."
    )
    undefined: bool = Field(
        default=False,
        description="Leave the record uninitialised, so it reads INVALID/UDF — "
        "what an operator sees as `PV INV`.",
    )
    moving: bool = Field(
        default=True, description="False pins an analogue readout instead of drifting it."
    )


class Readable(ComponentConfig):
    """Config shared by anything that shows a number or a state."""

    label: str = Field(description="Row label. Keep it short; the column is fixed width.")
    pv: str = Field(description="PV to read.")
    units: str | None = Field(
        default=None,
        description="Engineering units. Wins over the PV's own EGU field, because "
        "the config is what an engineer can fix without touching an IOC.",
    )
    format: Any = Field(
        default=None,
        description="Decimal places (a number), or {format: exponential|precision|"
        "fixed|raw, …}. Unset means three decimals.",
    )
    range: tuple[float, float] | None = Field(
        default=None,
        description="Engineering range [low, high]. Also the band a simulated "
        "reading drifts inside, so setting it is worth doing.",
    )
    alarm: Alarm = Field(default_factory=Alarm, description="EPICS alarm limits; see Alarm.")
    demo: Demo = Field(default_factory=Demo, description="Simulation behaviour; see Demo.")
    actions: list[Action] = Field(
        default_factory=list, description="Buttons, revealed by a cog beside the row."
    )
    setpoint: Setpoint | None = Field(
        default=None, description="A value the operator types or picks."
    )
    wide: bool = Field(
        default=False,
        description="Widen this row's value field, for a string that does not fit "
        "the standard one (a long recipe or state name). Readings are otherwise "
        "all one width, which is what lets a column be scanned down.",
    )

    @property
    def value_format(self) -> ValueFormatOptions | None:
        return parse_format(self.format)

    @property
    def low(self) -> float:
        return self.range[0] if self.range else 0.0

    @property
    def high(self) -> float:
        return self.range[1] if self.range else 100.0


# ---------------------------------------------------------------------------
# Declaring PVs
# ---------------------------------------------------------------------------


def number_spec(name: str, cfg: Readable, *, desc: str = "", integer: bool = False) -> PvSpec:
    """A drifting analogue (or integer) readout, with its limits."""
    span = cfg.high - cfg.low
    return PvSpec(
        name=name,
        kind="int" if integer else "float",
        value=cfg.demo.value,
        low=cfg.low,
        high=cfg.high,
        # A fortieth of the band per tick: visibly alive, not noise.
        step=max(span / 40.0, 1e-9) if cfg.demo.moving else 0.0,
        prec=_decimals(cfg),
        egu=cfg.units,
        high_alarm=cfg.alarm.high,
        hihi=cfg.alarm.hihi,
        low_alarm=cfg.alarm.low,
        lolo=cfg.alarm.lolo,
        severity=cfg.demo.severity,
        undefined=cfg.demo.undefined,
        writable=bool(cfg.actions or cfg.setpoint),
        desc=desc or cfg.label,
    )


def bool_spec(
    name: str,
    label: str,
    *,
    value: int = 1,
    severity: int = 0,
    writable: bool = False,
    undefined: bool = False,
) -> PvSpec:
    return PvSpec(
        name=name,
        kind="bool",
        value=value,
        severity=severity,
        writable=writable,
        undefined=undefined,
        desc=label,
    )


def enum_spec(
    name: str,
    label: str,
    states: Iterable[str],
    *,
    value: int = 0,
    severity: int = 0,
    writable: bool = False,
) -> PvSpec:
    return PvSpec(
        name=name,
        kind="enum",
        value=value,
        states=tuple(states),
        severity=severity,
        writable=writable,
        desc=label,
    )


def string_spec(name: str, label: str, *, value: str = "", writable: bool = False) -> PvSpec:
    return PvSpec(name=name, kind="string", value=value, writable=writable, desc=label)


def write_targets(cfg: Readable) -> list[tuple[str, Any]]:
    """Every (pv, value) a component's buttons and setpoint can write.

    Used to mark those PVs writable in the simulator and the generated IOC, so
    pressing a button locally actually changes a reading.
    """
    targets: list[tuple[str, Any]] = [(action.pv or cfg.pv, action.value) for action in cfg.actions]
    if cfg.setpoint:
        targets.append((cfg.setpoint.pv or cfg.pv, None))
    return targets


def _decimals(cfg: Readable) -> int:
    options = cfg.value_format
    if options is None:
        return 3
    if options.format == "fixed":
        return options.to_fixed
    if options.format == "precision":
        return options.to_precision
    return 3


# ---------------------------------------------------------------------------
# A YAML trap worth naming
# ---------------------------------------------------------------------------

#: The words YAML 1.1 turns into booleans behind your back.
YAML_BOOLEANS = ("OFF", "ON", "NO", "YES", "Y", "N", "TRUE", "FALSE")


def state_names(values: list[Any], field: str = "states") -> list[str]:
    """Validate a list of state names, and explain the YAML booleans.

    `states: [OFF, COOLING]` does not do what it looks like: YAML 1.1 reads
    `OFF` as the boolean false, so the list arrives as `[False, 'COOLING']` and
    the error would otherwise be "Input should be a valid string" — true, and
    no help at all. The same applies to ON, YES, NO, Y, N, TRUE and FALSE,
    which between them cover most of the state names in a control system.
    """
    for value in values:
        if isinstance(value, bool):
            raise ValueError(
                f"{field}: YAML read one of these as a boolean, not a name. "
                f"Quote it: {', '.join(repr(word) for word in YAML_BOOLEANS)} "
                f"all need quoting in YAML — write `- \"OFF\"`."
            )
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{field}: {value!r} is not a state name")
    return [value.strip() for value in values]
