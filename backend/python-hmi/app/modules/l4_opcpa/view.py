"""The L4 OPCPA page as a whole: which widgets exist, which PVs they need, how
to render the page once, and how to render just the parts a change touched.

This is the piece that has no counterpart in the React app, because in the React
app the browser did it: a component subscribed, React diffed, the DOM updated.
Here the diff is "which widgets read a PV that changed", computed from the
reverse index built in `__init__`, and the DOM update is a Datastar
`patch-elements` event carrying the re-rendered element.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Iterable, Sequence

from jinja2 import Environment
from markupsafe import Markup

from app.epics.types import PvId
from app.templating import WidgetRenderer

from .config import LaserSpec
from .widgets import FLASHLAMP_STATES, PanelModel, PvReader, Widget, build_panel

#: Status legend strip above the grid — `color-legend.tsx`.
#:
#: The swatches are painted by the same tone layer as the panels, so the legend
#: can never drift from what a panel actually shows: changing a tone changes
#: both. It lists what the panel uses today; `positive-neutral`,
#: `negative-neutral` and `negative-important` are defined in the tone layer but
#: deliberately unadvertised.
LEGEND: tuple[dict[str, str | None], ...] = (
    {"tone": None, "label": "NEUTRAL", "meaning": "normal reading — no alarm"},
    {
        "tone": "positive-important",
        "label": "GOOD",
        "meaning": "connected / at full power / no faults",
    },
    {"tone": "warning", "label": "MINOR", "meaning": "EPICS MINOR alarm"},
    {"tone": "error", "label": "MAJOR", "meaning": "EPICS MAJOR alarm"},
    {
        "tone": "invalid",
        "label": "INVALID",
        "meaning": "reading cannot be trusted (INVALID severity or PV disconnected)",
    },
    {
        "tone": "unknown",
        "label": "NO DATA",
        "meaning": "nothing received yet, or the backend link is down",
    },
)

LINK_BANNER_ID = "link-banner"

#: Page-level signals. `_age` is the staleness watchdog (seconds since the last
#: heartbeat), `_busy` is Datastar's indicator for an in-flight write, `_toast`
#: is the write result line and `_toast_age` ages it out.
PAGE_SIGNALS: dict[str, object] = {
    "_age": 0,
    "_busy": False,
    "_toast": "",
    "_toast_age": 0,
}


@dataclass
class LaserRender:
    panel: PanelModel
    html: dict[str, Markup] = field(default_factory=dict)


class L4OpcpaView:
    def __init__(self, specs: Sequence[LaserSpec], env: Environment):
        self._env = env
        self._renderer = WidgetRenderer(env, "l4_opcpa/widgets.html")
        self.panels: list[PanelModel] = [build_panel(spec) for spec in specs]

        # The link banner is a widget with no PVs: it re-renders on the
        # heartbeat rather than on a value change, because what it reports is
        # the state of the link itself.
        self.link_banner = Widget(
            id=LINK_BANNER_ID,
            macro="link_banner",
            pvs=(),
            build=lambda read: {"ok": read.is_connected},
        )

        self._by_pv: dict[PvId, list[Widget]] = {}
        for panel in self.panels:
            for widget in panel.widgets.values():
                for pv in widget.pvs:
                    self._by_pv.setdefault(pv, []).append(widget)

    # ------------------------------------------------------------------ queries

    @property
    def all_pvs(self) -> set[PvId]:
        return set(self._by_pv)

    def signals(self) -> dict[str, object]:
        signals = dict(PAGE_SIGNALS)
        for panel in self.panels:
            signals.update(panel.signals())
        return signals

    def widgets_for(self, dirty: Iterable[PvId]) -> list[Widget]:
        """Widgets touched by a set of changed PVs, each at most once.

        A widget reading eight MSS bits that all change in one scan is rendered
        once, which is the entire reason the reverse index exists.
        """
        seen: set[str] = set()
        touched: list[Widget] = []
        for pv in dirty:
            for widget in self._by_pv.get(pv, ()):
                if widget.id in seen:
                    continue
                seen.add(widget.id)
                touched.append(widget)
        return touched

    # ---------------------------------------------------------------- rendering

    def render_widget(self, widget: Widget, reader: PvReader) -> Markup:
        return self._renderer.render(widget, reader)

    def render_page(
        self,
        reader: PvReader,
        *,
        stream_url: str,
        zone_code: str,
        backend_label: str,
        catalog: Sequence[str],
        toast_seconds: int = 5,
        nav_items: Sequence[dict[str, object]] = (),
        palette: str | None = None,
    ) -> str:
        lasers = [
            LaserRender(
                panel=panel,
                html={
                    role: self.render_widget(widget, reader)
                    for role, widget in panel.widgets.items()
                },
            )
            for panel in self.panels
        ]
        template = self._env.get_template("l4_opcpa/page.html")
        return template.render(
            lasers=lasers,
            states=FLASHLAMP_STATES,
            legend=LEGEND,
            link_banner=self.render_widget(self.link_banner, reader),
            signals_json=json.dumps(self.signals(), separators=(",", ":")),
            stream_url=stream_url,
            zone_code=zone_code,
            backend_label=backend_label,
            catalog=list(catalog),
            toast_seconds=toast_seconds,
            nav_items=list(nav_items),
            palette=palette,
        )

    def render_all_widgets(self, reader: PvReader) -> str:
        """Every widget, concatenated into one patch payload.

        Sent once when a stream opens. The page was already rendered from the
        same cache, so this is not strictly necessary — but a PV can report in
        the milliseconds between the page render and the stream connecting, and
        an operator should never be looking at a value that is one update behind
        with nothing to tell them so.
        """
        parts = [str(self.render_widget(self.link_banner, reader))]
        for panel in self.panels:
            for widget in panel.widgets.values():
                parts.append(str(self.render_widget(widget, reader)))
        return "\n".join(parts)

    def render_patch(self, reader: PvReader, dirty: Iterable[PvId]) -> str | None:
        widgets = self.widgets_for(dirty)
        if not widgets:
            return None
        # One SSE event carrying several root elements: Datastar matches each by
        # its id, so a scan that moved twelve chiller cells is one event, not
        # twelve.
        return "\n".join(str(self.render_widget(widget, reader)) for widget in widgets)

    def render_link_banner(self, reader: PvReader) -> str:
        return str(self.render_widget(self.link_banner, reader))
