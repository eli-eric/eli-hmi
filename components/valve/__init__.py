"""valve — a valve's state, and the two buttons that move it.

The smallest component in the folder, and the one to copy when writing a new
one. It is `value` with the vocabulary filled in: a valve has a known set of
states and a known pair of commands, so a screen should not have to spell them
out every time.

    - component: valve
      label: VV1 gate valve
      pv: L4-VCS-NL2:VV1:State
      open_pv: L4-VCS-NL2:VV1:Open      # optional; defaults to writing `pv`
      close_pv: L4-VCS-NL2:VV1:Close
"""

from __future__ import annotations

from typing import Any

from pydantic import Field, field_validator

from components.common import Exclusive, exclusive_names, state_names
from core.components import Component, ComponentConfig, Datatype, PvId, PvReader, PvSpec, register
from core.render import mapped_readout

#: What a valve record reports, in index order. `MOVING` matters: an operator
#: pressing Open needs to see that something happened before it is open.
STATES = ("CLOSED", "OPEN", "MOVING", "FAULT")

#: The buttons `exclusive:` can name.
CONTROLS = ("open", "close")


class Config(ComponentConfig):
    label: str = Field(description="Row label.")
    pv: str = Field(description="State PV — an enum record, read by name.")
    open_pv: str | None = Field(
        default=None, description="PV the Open button writes 1 to. Defaults to `pv`."
    )
    close_pv: str | None = Field(
        default=None, description="PV the Close button writes 1 to. Defaults to `pv`."
    )
    states: list[Any] = Field(
        default_factory=lambda: list(STATES),
        description="State names in index order; only the simulator and the local "
        "IOC use them. Quote OFF / ON / NO / YES: YAML reads them as booleans.",
    )

    exclusive: Exclusive = Field(
        default=False,
        description="Only the tab that has taken control may press these: "
        "`true` for both buttons, or a list naming them (`[open, close]`).",
    )

    @field_validator("states")
    @classmethod
    def _states(cls, value: list[Any]) -> list[str]:
        return state_names(value)

    @field_validator("exclusive")
    @classmethod
    def _exclusive(cls, value: Exclusive) -> Exclusive:
        exclusive_names(value, CONTROLS)
        return value


@register
class Valve(Component):
    name = "valve"
    summary = "A valve: state pill plus Open and Close."
    Config = Config
    template = "valve/valve.html"

    config: Config

    def setup(self) -> None:
        cfg = self.config
        self.cog = self.signal("cog")
        self.add("state", "pill", [PvId(cfg.pv, Datatype.ENUM_STRING)], self._state)
        targets = {"open": cfg.open_pv or cfg.pv, "close": cfg.close_pv or cfg.pv}
        for control in exclusive_names(cfg.exclusive, CONTROLS):
            self.exclusive(targets[control])

    def _state(self, read: PvReader) -> dict[str, Any]:
        cfg = self.config
        return {
            "readout": mapped_readout(
                read(cfg.pv, Datatype.ENUM_STRING),
                pv_name=cfg.pv,
                is_connected=read.is_connected,
            )
        }

    def pv_specs(self) -> list[PvSpec]:
        cfg = self.config
        specs = [
            PvSpec(
                name=cfg.pv,
                kind="enum",
                value=0,
                states=tuple(cfg.states),
                writable=True,
                desc=cfg.label,
            )
        ]
        # A separate command PV is a trigger: writing 1 to it drives the state
        # record. Declaring the effect here is what makes the button work
        # against the simulator and against the local IOC alike.
        for command, state in ((cfg.open_pv, "OPEN"), (cfg.close_pv, "CLOSED")):
            if command and command != cfg.pv:
                specs.append(
                    PvSpec(
                        name=command,
                        kind="int",
                        command=True,
                        value=1,
                        effects=((cfg.pv, cfg.states.index(state) if state in cfg.states else 0),),
                        desc=f"{cfg.label} {state.lower()}",
                    )
                )
        return specs

    def context(self) -> dict[str, Any]:
        cfg = self.config
        return {
            "cog": self.cog,
            "open_target": (cfg.open_pv or cfg.pv, 1 if cfg.open_pv else _index(cfg, "OPEN")),
            "close_target": (cfg.close_pv or cfg.pv, 1 if cfg.close_pv else _index(cfg, "CLOSED")),
        }


def _index(cfg: Config, state: str) -> int:
    return cfg.states.index(state) if state in cfg.states else 0
