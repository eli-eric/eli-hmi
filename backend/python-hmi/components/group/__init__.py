"""group — several related signals as one pill that expands into a list.

For the case a screen has over and over: twenty error codes, eight interlock
permissions, seven subsystem states. Twenty rows would bury the screen; one row
that says `1/20` and opens on a click does not.

    - component: group
      label: Interlocks
      mode: permissions          # YES/NO, and green only when all are granted
      note: "Not an exhaustive list of the parameters behind the overall MSS."
      items:
        - { label: PSS permission, pv: L4-PSS:NP2_PERMISSION_TO_OPERATE_CH1 }
        - { label: Vacuum good,    pv: L4-VCS-NL2:ReadyToFire }

    - component: group
      label: Module errors
      mode: codes                # counts the ones that are not "0000"
      items:
        - { label: "PS1225:11", pv: "L4-OPCPA-NL2:PS1225:11:ErrorCode" }

Three modes, because the three aggregates behave differently and an operator
reads them differently:

* ``permissions`` — YES when every item is granted, NO otherwise. Green when
  YES, plain when NO.
* ``states`` — a count, `5/7` of the items that are on. Never green: a Modbox
  subsystem being off is not bad news, it is information.
* ``codes`` — a count of items whose value is *not* the OK code, so `0/22` is
  the quiet state.

None of them colours by its own value. The pill's tone is the worst EPICS
severity among its items — if a failed permission is genuinely an alarm, the
IOC says so, and this is not the place to have a second opinion. Absence of
green is the signal.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from components.common import Strict, ValueText, bool_spec, string_spec
from core.components import Component, ComponentConfig, PvId, PvReader, PvSpec, register
from core.render import (
    ON_OFF_TEXT,
    YES_NO_TEXT,
    Readout,
    aggregate_readout,
    mapped_readout,
    present_aggregate,
    severity_tone,
)

Mode = Literal["permissions", "states", "codes"]


class Item(Strict):
    label: str = Field(description="Row label in the expanded list.")
    pv: str = Field(description="PV to read.")
    values: ValueText = Field(
        default_factory=dict,
        description="Display text per raw value for this item, e.g. {0: DISABLED}.",
    )
    demo: dict[str, Any] = Field(
        default_factory=dict,
        description="Simulation only: {value: 0, severity: 1} to make this item "
        "the one that is unhappy, so the screen shows an operator what that "
        "looks like.",
    )


class Config(ComponentConfig):
    label: str = Field(description="Row label for the summary pill.")
    mode: Mode = Field(
        default="permissions",
        description="permissions = YES/NO; states = a count of items that are on; "
        "codes = a count of items reporting a non-OK code.",
    )
    items: list[Item] = Field(min_length=1, description="The signals behind the pill.")
    ok_code: str = Field(
        default="0000",
        description="For `codes`: the value that means no error.",
    )
    note: str | None = Field(
        default=None,
        description="Sentence shown at the bottom of the expanded list. Use it to "
        "say what the list is *not* — an operator reading a partial list as the "
        "whole truth is a real failure mode.",
    )


@register
class Group(Component):
    name = "group"
    summary = "Several related signals as one pill that expands into a list."
    Config = Config
    template = "group/group.html"

    config: Config

    def setup(self) -> None:
        pvs = [PvId(item.pv) for item in self.config.items]
        self.open_signal = self.signal("open")
        self.add("pill", "state_pill", pvs, self._pill)
        self.add("list", "detail_list", pvs, self._list, show=f"${self.open_signal}")

    # -- the summary -------------------------------------------------------

    def _pill(self, read: PvReader) -> dict[str, Any]:
        cfg = self.config
        samples = read.many(item.pv for item in cfg.items)
        total = len(samples)

        if cfg.mode == "permissions":
            # "granted" means healthy AND unalarmed — otherwise the pill could
            # read YES while painted red for an alarmed item.
            granted = sum(
                1
                for sample in samples
                if severity_tone(sample) == "none" and sample is not None and sample.value == 1
            )
            readout = aggregate_readout(
                samples,
                fallback_text="YES" if granted == total else "NO",
                emphasis="positive-important" if granted == total else None,
                is_connected=read.is_connected,
            )
        elif cfg.mode == "states":
            on = sum(1 for sample in samples if sample is not None and sample.value == 1)
            severity = present_aggregate(samples, is_connected=read.is_connected)
            # 'unknown' (nothing has reported yet) stays unpainted: this pill
            # never colours by the raw bit either, so "no data" and "all fine"
            # deliberately look the same.
            tone = None if severity.tone == "unknown" else severity.tone
            text = f"{on}/{total}" if severity.tone == "unknown" else (severity.text or f"{on}/{total}")
            readout = Readout(text=text, tone=tone, title=severity.title)
        else:
            unknown = sum(1 for sample in samples if severity_tone(sample) == "unknown")
            ok = sum(
                1
                for sample in samples
                if severity_tone(sample) == "none"
                and sample is not None
                and str(sample.value) == cfg.ok_code
            )
            bad = total - ok - unknown
            readout = aggregate_readout(
                samples,
                fallback_text=f"{bad}/{total}",
                emphasis="positive-important" if bad == 0 else None,
                is_connected=read.is_connected,
            )
        return {"readout": readout, "signal": self.open_signal}

    def _list(self, read: PvReader) -> dict[str, Any]:
        cfg = self.config
        # Codes arrive as they are: there is no vocabulary to translate a status
        # code into. A bit gets words, because a column of 1s and 0s asks the
        # operator to remember which is which.
        defaults = None if cfg.mode == "codes" else (
            YES_NO_TEXT if cfg.mode == "permissions" else ON_OFF_TEXT
        )
        return {
            "labels": [item.label for item in cfg.items],
            "items": [
                mapped_readout(
                    read(item.pv),
                    pv_name=item.pv,
                    values=item.values or None,
                    defaults=defaults,
                    is_connected=read.is_connected,
                )
                for item in cfg.items
            ],
            "note": cfg.note,
        }

    # -- what these PVs are ------------------------------------------------

    def pv_specs(self) -> list[PvSpec]:
        cfg = self.config
        specs: list[PvSpec] = []
        for item in cfg.items:
            demo = item.demo
            if cfg.mode == "codes":
                specs.append(
                    string_spec(
                        item.pv,
                        item.label,
                        value=str(demo.get("value", cfg.ok_code)),
                    )
                )
            else:
                specs.append(
                    bool_spec(
                        item.pv,
                        item.label,
                        value=int(demo.get("value", 1)),
                        severity=int(demo.get("severity", 0)),
                    )
                )
        return specs

    def context(self) -> dict[str, Any]:
        return {"open_signal": self.open_signal}
