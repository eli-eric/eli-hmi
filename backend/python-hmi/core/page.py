"""One screen, rendered: the whole page, or just the parts a change touched.

This is the piece the React app kept in the browser — a component subscribed,
React diffed, the DOM updated. Here the diff is "which widgets read a PV that
changed", looked up in the reverse index built once at start-up, and the DOM
update is a Datastar `patch-elements` event carrying the re-rendered element.

Nothing in here knows what any particular component *is*. It walks the
component tree a GUI's YAML produced, collects widgets and signals, and renders.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Iterable, Sequence

from jinja2 import Environment
from markupsafe import Markup

from core.components import Component, PvReader, Widget
from core.epics import PvId
from core.jinja import WidgetRenderer
from core.zones import Gui, Zone

#: Status legend strip above the screen.
#:
#: The swatches are painted by the same tone layer as the components, so the
#: legend can never drift from what a screen actually shows: changing a tone
#: changes both.
LEGEND: tuple[dict[str, str | None], ...] = (
    {"tone": None, "label": "NEUTRAL", "meaning": "normal reading — no alarm"},
    {"tone": "positive-important", "label": "GOOD", "meaning": "connected / healthy"},
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
        "meaning": "nothing received yet, or the link to EPICS is down",
    },
)

LINK_BANNER_ID = "link-banner"

#: Page-level signals. `_age` is the staleness watchdog (seconds since the last
#: heartbeat), `_busy` is Datastar's indicator for an in-flight write, `_toast`
#: is the write-result line and `_toast_age` ages it out.
PAGE_SIGNALS: dict[str, Any] = {"_age": 0, "_busy": False, "_toast": "", "_toast_age": 0}

#: Seconds a write result stays on screen, counted down by the page's own tick.
TOAST_SECONDS = 5


@dataclass(frozen=True)
class _Banner:
    """The link banner is a widget with no PVs: it re-renders on the heartbeat
    rather than on a value change, because what it reports is the state of the
    link itself.
    """

    id: str = LINK_BANNER_ID
    macro: tuple[str, str] = ("readouts.html", "link_banner")
    pvs: tuple[PvId, ...] = ()
    show: str | None = None

    @staticmethod
    def build(reader: PvReader) -> dict[str, Any]:
        return {"ok": reader.is_connected}


class Page:
    """A renderable screen: one GUI of one zone."""

    def __init__(self, zone: Zone, gui: Gui, env: Environment):
        self.zone = zone
        self.gui = gui
        self._env = env
        self._renderer = WidgetRenderer(env)
        self.link_banner = _Banner()

        self._by_pv: dict[PvId, list[Widget]] = {}
        for widget in gui.all_widgets():
            for pv in widget.pvs:
                self._by_pv.setdefault(pv, []).append(widget)

    # ------------------------------------------------------------------ queries

    @property
    def all_pvs(self) -> set[PvId]:
        return set(self._by_pv)

    @property
    def widget_count(self) -> int:
        return sum(len(widgets) for widgets in self._by_pv.values())

    def signals(self) -> dict[str, Any]:
        return {**PAGE_SIGNALS, **self.gui.signals()}

    def widgets_for(self, dirty: Iterable[PvId]) -> list[Widget]:
        """Widgets touched by a set of changed PVs, each at most once.

        A widget reading eight interlock bits that all change in one scan is
        rendered once, which is the entire reason the reverse index exists.
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

    def render_widget(self, widget: Any, reader: PvReader) -> Markup:
        return self._renderer.render(widget, reader)

    def render_component(self, component: Component, reader: PvReader) -> Markup:
        """A component's own template, with its widgets already rendered.

        Children are rendered first and handed in as `children`, so a container
        component (a `panel`) never has to know what it contains.
        """
        template = self._env.get_template(component.template)
        return Markup(
            template.render(
                c=component.config,
                w={role: self.render_widget(widget, reader) for role, widget in component.widgets.items()},
                s=component.signals,
                comp=component,
                children=[self.render_component(child, reader) for child in component.children],
                **component.context(),
            )
        )

    def render(
        self,
        reader: PvReader,
        *,
        backend_label: str,
        palette: str | None = None,
        user: str | None = None,
    ) -> str:
        # Components are rendered BEFORE the signal list is serialised, and the
        # order matters: a template may create a signal as it goes (the cog on a
        # row of buttons), and `data-signals` has to carry every signal the
        # markup references. A `data-show` pointing at a signal that does not
        # exist yet evaluates against `undefined`, which is how an expandable
        # list ends up rendered open on the first paint.
        rendered = [self.render_component(component, reader) for component in self.gui.components]
        template = self._env.get_template("page.html")
        return template.render(
            zone=self.zone,
            gui=self.gui,
            menu=self.zone.menu(),
            components=rendered,
            legend=LEGEND,
            link_banner=self.render_widget(self.link_banner, reader),
            signals_json=json.dumps(self.signals(), separators=(",", ":")),
            stream_url=self.gui.stream_url,
            backend_label=backend_label,
            toast_seconds=TOAST_SECONDS,
            palette=palette,
            user=user,
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
        parts.extend(str(self.render_widget(widget, reader)) for widget in self.gui.all_widgets())
        return "\n".join(parts)

    def render_patch(self, reader: PvReader, dirty: Iterable[PvId]) -> str | None:
        widgets = self.widgets_for(dirty)
        if not widgets:
            return None
        # One SSE event carrying several root elements: Datastar matches each by
        # its id, so a scan that moved twelve chiller cells is one event.
        return "\n".join(str(self.render_widget(widget, reader)) for widget in widgets)

    def render_link_banner(self, reader: PvReader) -> str:
        return str(self.render_widget(self.link_banner, reader))


def build_pages(zone: Zone, env: Environment) -> dict[str, Page]:
    """One `Page` per GUI in the zone, keyed by slug."""
    return {gui.slug: Page(zone, gui, env) for gui in zone.guis}


def all_pvs(pages: Sequence[Page]) -> set[PvId]:
    pvs: set[PvId] = set()
    for page in pages:
        pvs |= page.all_pvs
    return pvs
