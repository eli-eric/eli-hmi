"""tally — how many of these are in each state, expanding into the detail.

For a bank of identical channels whose *distribution* is what matters. Fourteen
flashlamps, sixteen heaters, twenty pumps: an operator wants "12 standby, 2
stopped", not fourteen rows. The rows are still there, one click away.

    - component: tally
      label: Flashlamps
      states: [SB, RUN, STOP, FAIL]
      aliases: { STANDBY: SB, FAILURE: FAIL }
      channels:
        - { label: "PS5059:22 Ch1", pv: "L4-OPCPA-NL2:PS5059:22:Ch1_State" }
        - { label: "PS5059:22 Ch2", pv: "L4-OPCPA-NL2:PS5059:22:Ch2_State" }

`states` are the columns, in order. `aliases` map what the record actually says
onto them, because `STANDBY` does not fit a 2.4rem column but `SB` does. A state
with no column is counted in none of them — and still shown, by name, in the
expanded list. That is deliberate: an unexpected state must not vanish.

A channel with no usable reading is counted in no column either, and the row
says so on hover. Counting it would let a dead channel report itself as RUN,
and the tally would go on claiming every channel is accounted for.
"""

from __future__ import annotations

from typing import Any

from pydantic import Field, field_validator, model_validator

from components.common import state_names, Strict
from core.components import Component, ComponentConfig, Datatype, PvId, PvReader, PvSpec, register
from core.render import TRANSPORT_DOWN_TITLE, is_usable, mapped_readout


class Channel(Strict):
    label: str = Field(description="Row label in the expanded list.")
    pv: str = Field(description="State PV. Read by name, so it must be an enum record.")
    demo: dict[str, Any] = Field(
        default_factory=dict,
        description="Simulation only: {state: STOP} to park this channel somewhere "
        "other than the first state, so the tally is not one full column.",
    )


class Config(ComponentConfig):
    label: str = Field(default="State", description="Row label beside the counts.")
    states: list[Any] = Field(
        min_length=1,
        max_length=6,
        description="The columns, in order. Keep them to four characters: the row "
        "has about 2.4rem per column beside the label.",
    )
    aliases: dict[str, str] = Field(
        default_factory=dict,
        description="Map the record's state names onto the columns, e.g. "
        "{STANDBY: SB}. A state not mapped and not a column is counted nowhere.",
    )
    channels: list[Channel] = Field(min_length=1, description="The channels being counted.")
    all_states: list[Any] = Field(
        default_factory=list,
        description="Every state the record can report, in index order. Only the "
        "simulator and the local IOC use it; defaults to `states` plus the "
        "aliases' keys. Quote OFF / ON / NO / YES: YAML reads them as booleans.",
    )

    @field_validator("states", "all_states")
    @classmethod
    def _states(cls, value: list[Any]) -> list[str]:
        return state_names(value)

    @model_validator(mode="after")
    def _aliases_point_at_columns(self) -> "Config":
        unknown = sorted(set(self.aliases.values()) - set(self.states))
        if unknown:
            raise ValueError(
                f"aliases map onto {', '.join(unknown)}, which are not columns. "
                f"Columns here: {', '.join(self.states)}"
            )
        return self

    @property
    def record_states(self) -> list[str]:
        if self.all_states:
            return list(self.all_states)
        # Aliases first: their keys are the record's real names.
        seen = list(self.aliases) + [state for state in self.states if state not in self.aliases.values()]
        return seen or list(self.states)


@register
class Tally(Component):
    name = "tally"
    summary = "How many channels are in each state, expanding into the detail."
    Config = Config
    template = "tally/tally.html"

    config: Config

    def setup(self) -> None:
        # State records are enum records: read natively they give an index, so
        # ask Channel Access for the name.
        pvs = [PvId(channel.pv, Datatype.ENUM_STRING) for channel in self.config.channels]
        self.open_signal = self.signal("open")
        self.add("counts", "tally_cells", pvs, self._counts)
        self.add("list", "detail_list", pvs, self._list, show=f"${self.open_signal}")

    def _counts(self, read: PvReader) -> dict[str, Any]:
        cfg = self.config
        counts = {state: 0 for state in cfg.states}
        uncounted = 0
        for channel in cfg.channels:
            sample = read(channel.pv, Datatype.ENUM_STRING)
            if not is_usable(sample):
                uncounted += 1
                continue
            value = sample.value if sample is not None else None
            if isinstance(value, str):
                state = cfg.aliases.get(value.upper(), value.upper())
                if state in counts:
                    counts[state] += 1

        # The columns no longer add up to the number of channels, so say why on
        # hover. A channel in a state with no column is a separate, expected
        # case and is not reported here; the expanded list shows it.
        if not read.is_connected:
            title = TRANSPORT_DOWN_TITLE
        elif uncounted:
            title = (
                f"{uncounted} of {len(cfg.channels)} channels have no usable "
                f"reading and are not counted."
            )
        else:
            title = None
        return {
            "states": cfg.states,
            "counts": counts,
            "title": title,
            # Stale counts grey out with everything else when the link drops.
            "tone": None if read.is_connected else "unknown",
        }

    def _list(self, read: PvReader) -> dict[str, Any]:
        """A channel row shows its state name and nothing more.

        No state is coloured here — not even FAILURE: a failed channel is an
        alarm condition and the IOC raises it as one, which the shared table
        then paints. Colouring it a second time from the string would mean two
        independent notions of "bad".
        """
        cfg = self.config
        return {
            "labels": [channel.label for channel in cfg.channels],
            "items": [
                mapped_readout(
                    read(channel.pv, Datatype.ENUM_STRING),
                    pv_name=channel.pv,
                    is_connected=read.is_connected,
                )
                for channel in cfg.channels
            ],
            "note": None,
        }

    def pv_specs(self) -> list[PvSpec]:
        cfg = self.config
        states = cfg.record_states
        specs = []
        for channel in cfg.channels:
            wanted = channel.demo.get("state")
            index = states.index(wanted) if wanted in states else 0
            specs.append(
                PvSpec(
                    name=channel.pv,
                    kind="enum",
                    value=index,
                    states=tuple(states),
                    desc=channel.label,
                )
            )
        return specs

    def context(self) -> dict[str, Any]:
        return {"open_signal": self.open_signal}
