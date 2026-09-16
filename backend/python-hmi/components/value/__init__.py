"""value — one row: a label, a reading, and optionally buttons or a setpoint.

The workhorse. Most of any screen is these.

    - component: value                      # a number
      label: Flow
      pv: L4-OPCPA-NL2:PS1225:11:MeasuredFlow
      units: l/min
      format: 2
      range: [11, 16]
      alarm: { low: 11, lolo: 10 }

    - component: value                      # a state, with buttons
      label: Shutter
      pv: L4-OPCPA-NL2:IO:15:RC1_pin31
      kind: bool
      on: is OPEN
      off: is CLOSED
      actions:
        - { label: Open, value: 1 }
        - { label: Close, value: 0 }

    - component: value                      # a setpoint
      label: Attenuator
      pv: L4-OPCPA-NL2:SM5-ATT1:51:CurrentPosition
      kind: integer
      setpoint: { label: Set attenuator, presets: [0, 25, 50, 75] }

`kind` decides how the reading is read and shown, and it matters more than it
looks: an enum record read at its native type delivers an *index*, so `enum`
asks Channel Access for the state name instead. Getting that wrong is why a
status row shows `2` where it should say `STANDBY`.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import Field, field_validator

from components.common import (
    GoodState,
    Readable,
    ValueText,
    number_spec,
    state_names,
    string_spec,
    write_targets,
)
from core.components import Component, Datatype, PvId, PvReader, PvSpec, register
from core.render import (
    bool_readout,
    mapped_readout,
    number_readout,
    string_readout,
)

Kind = Literal["number", "integer", "bool", "enum", "text"]


class Config(Readable):
    kind: Kind = Field(
        default="number",
        description="number = a float; integer = whole numbers; bool = a bit, "
        "shown as a pill; enum = a state record, read by name; text = a string.",
    )
    # `on_text`/`off_text`, not `on`/`off`: YAML 1.1 reads the bare keys `on:`
    # and `off:` as booleans, so `on: is OPEN` would arrive as `{True: …}`.
    on_text: str = Field(default="ON", description="Text for a `bool` reading 1.")
    off_text: str = Field(default="OFF", description="Text for a `bool` reading 0.")
    good: GoodState = Field(
        default="neither",
        description="Which state is good news, and therefore green. `neither` is "
        "the default and usually right: a shutter being open is not good or bad, "
        "while a connection being up is.",
    )
    values: ValueText = Field(
        default_factory=dict,
        description="Display text per raw value, e.g. {0: OFF, 1: ON}. What a bit "
        "means is domain knowledge that belongs beside the PV. Unmapped values are "
        "shown as they arrive rather than disappearing.",
    )
    states: list[Any] = Field(
        default_factory=list,
        description="For `enum`: the state names in index order. Only the local "
        "IOC and the simulator use them — the real record supplies its own. "
        "Quote OFF / ON / NO / YES: YAML reads them as booleans.",
    )

    @field_validator("states")
    @classmethod
    def _states(cls, value: list[Any]) -> list[str]:
        return state_names(value)


@register
class Value(Component):
    name = "value"
    summary = "One row: label, reading, optional buttons and setpoint."
    Config = Config
    template = "value/value.html"

    config: Config

    def setup(self) -> None:
        cfg = self.config
        # An enum record read at its native type delivers the state's index, not
        # its name, so ask the gateway for the name. Everything else reads
        # native.
        self.datatype = Datatype.ENUM_STRING if cfg.kind == "enum" else Datatype.NATIVE
        pv = PvId(cfg.pv, self.datatype)

        if cfg.kind == "bool":
            self.add("value", "pill", [pv], self._bool)
        else:
            self.add("value", "value_cell", [pv], self._value)

    # -- the reading -------------------------------------------------------

    def _bool(self, read: PvReader) -> dict[str, Any]:
        cfg = self.config
        sample = read(cfg.pv, self.datatype)
        if cfg.values:
            # An explicit mapping wins, and covers a "boolean" that one day
            # reports 7 — it stays visible instead of being mistranslated.
            return {
                "readout": mapped_readout(
                    sample,
                    pv_name=cfg.pv,
                    values=cfg.values,
                    is_connected=read.is_connected,
                )
            }
        return {
            "readout": bool_readout(
                sample,
                pv_name=cfg.pv,
                on_label=cfg.on_text,
                off_label=cfg.off_text,
                on_emphasis="positive-important" if cfg.good == "on" else None,
                is_connected=read.is_connected,
                strict=True,
            )
        }

    def _value(self, read: PvReader) -> dict[str, Any]:
        cfg = self.config
        sample = read(cfg.pv, self.datatype)
        if cfg.kind in ("enum", "text"):
            readout = string_readout(sample, pv_name=cfg.pv, is_connected=read.is_connected)
            if cfg.values:
                readout = mapped_readout(
                    sample, pv_name=cfg.pv, values=cfg.values, is_connected=read.is_connected
                )
            return {"readout": readout}
        return {
            "readout": number_readout(
                sample,
                pv_name=cfg.pv,
                value_format=cfg.value_format,
                units=cfg.units,
                integer=cfg.kind == "integer",
                is_connected=read.is_connected,
            )
        }

    # -- what this PV is ---------------------------------------------------

    def pv_specs(self) -> list[PvSpec]:
        cfg = self.config
        writable = bool(write_targets(cfg))
        if cfg.kind in ("number", "integer"):
            spec = number_spec(cfg.pv, cfg, integer=cfg.kind == "integer")
        elif cfg.kind == "bool":
            spec = PvSpec(
                name=cfg.pv,
                kind="bool",
                value=1 if cfg.demo.value is None else cfg.demo.value,
                # The screen's own words become the record's ZNAM/ONAM, so the
                # local IOC reads the way the screen does.
                states=(cfg.off_text, cfg.on_text),
                severity=cfg.demo.severity,
                undefined=cfg.demo.undefined,
                desc=cfg.label,
            )
        elif cfg.kind == "enum":
            spec = PvSpec(
                name=cfg.pv,
                kind="enum",
                value=cfg.demo.value or 0,
                states=tuple(cfg.states),
                severity=cfg.demo.severity,
                undefined=cfg.demo.undefined,
                desc=cfg.label,
            )
        else:
            spec = string_spec(cfg.pv, cfg.label, value=str(cfg.demo.value or ""))
        specs = [PvSpec(**{**spec.__dict__, "writable": writable})]

        # A button or setpoint pointing somewhere else needs that PV to exist
        # too, or the write lands on nothing when there is no control system.
        for target, _value in write_targets(cfg):
            if target != cfg.pv:
                specs.append(
                    PvSpec(name=target, kind=spec.kind, value=spec.value, writable=True,
                           states=spec.states, desc=f"{cfg.label} setpoint")
                )
        return specs
