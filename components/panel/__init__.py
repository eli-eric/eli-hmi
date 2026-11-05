"""panel — a titled box that groups other components.

The only container. Everything else on a screen is a leaf, which keeps the YAML
shallow: a screen is panels, and a panel is rows.

    - component: panel
      title: "Chiller PS1225:11"
      components:
        - { component: value, label: Flow, pv: "…:MeasuredFlow", units: l/min }
        - { component: value, label: Temp, pv: "…:T_out", units: degC }
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from core.components import Component, ComponentConfig, register


class Config(ComponentConfig):
    title: str | None = Field(default=None, description="Heading, shown in the panel's dark bar.")
    width: Literal["single", "double"] = Field(
        default="single",
        description="`double` makes the panel two columns wide, for a table that "
        "does not fit a 22rem column. Panels wrap to the window either way.",
    )
    subtitle: str | None = Field(default=None, description="Small text under the heading.")


@register
class Panel(Component):
    name = "panel"
    summary = "A titled box grouping other components."
    Config = Config
    template = "panel/panel.html"
    accepts_children = True
