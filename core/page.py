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
import secrets
from dataclasses import dataclass
from typing import Any, Iterable, Sequence

from jinja2 import Environment
from markupsafe import Markup

from cameras.protocol import SOCKET_PATH as CAMERA_SOCKET_PATH
from core.components import Component, PvReader, Widget
from core.epics import PvId
from core.locks import LockTable
from core.palette import DEFAULT_PALETTE, PALETTES
from core.jinja import WidgetRenderer
from core.zones import Gui, Zone

LINK_BANNER_ID = "link-banner"

#: Page-level signals. `_age` is the staleness watchdog (seconds since the last
#: heartbeat), `_busy` is Datastar's indicator for an in-flight write, `_toast`
#: is the write-result line, `_toast_age` ages it out, and `_palette` is the
#: colour palette the header's selector is bound to.
#:
#: Two more are added per render (`Page.signals`): `_locks`, this tab's view of
#: each exclusive PV on the screen, and `tab`, the id the browser keeps in
#: `sessionStorage`. `tab` is the one page signal without a leading `_`, because
#: Datastar sends no `_` signal with a request and the server needs this one
#: with every write (`core.locks`).
PAGE_SIGNALS: dict[str, Any] = {
    "_age": 0,
    "_busy": False,
    "_toast": "",
    "_toast_age": 0,
    "_palette": DEFAULT_PALETTE,
}


def new_tab_id() -> str:
    """A tab id for a browser that has none yet. The page offers one with
    every render; the browser keeps the first it got for as long as the tab
    lives, so a reload is the same tab."""
    return secrets.token_urlsafe(16)

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

    def __init__(self, zone: Zone, gui: Gui, env: Environment, locks: LockTable | None = None):
        self.zone = zone
        self.gui = gui
        self._env = env
        self._renderer = WidgetRenderer(env)
        self.link_banner = _Banner()
        #: Shared by every screen of the app (`core.server`), so a lock taken
        #: here shows on any screen with a control for the same PV. A page
        #: built on its own gets a table of its own, with every PV free.
        self.locks = locks if locks is not None else LockTable(zone.exclusive_pvs())
        #: Every PV a control on this screen can write, from what the
        #: components declared about their PVs.
        self.written_pvs: frozenset[str] = frozenset(
            spec.name for spec in gui.all_pv_specs() if spec.writable or spec.command
        )
        #: The exclusive ones: what this screen's `_locks` signal carries and
        #: what its stream keeps alive (`LockTable.watch`).
        self.exclusive_pvs: frozenset[str] = self.written_pvs & self.locks.exclusive

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

    def sizes(self) -> dict[str, int]:
        """How big the screen is, as `/stats` and `/monitor` report it."""
        return {
            "components": sum(1 for _ in self.gui.walk()),
            "widgets": len(list(self.gui.all_widgets())),
            "pvs": len(self.all_pvs),
        }

    def signals(
        self, palette: str | None = None, *, tab: str | None = None, user: str = ""
    ) -> dict[str, Any]:
        """Every signal the page declares, up front.

        `palette` seeds the header selector so it opens on the palette the
        page was actually rendered in, rather than snapping to the default
        after the first paint.

        `_locks` is rendered without knowing which tab is asking — the browser
        says that over the stream — so a held PV starts as someone else's and
        its controls start locked. The stream's first event unlocks the ones
        this tab holds.
        """
        return {
            **PAGE_SIGNALS,
            "_palette": palette or DEFAULT_PALETTE,
            "_locks": self.lock_view(tab=None, user=user),
            "tab": tab or new_tab_id(),
            **self.gui.signals(),
        }

    def lock_view(self, *, tab: str | None, user: str) -> dict[str, Any]:
        """This screen's `_locks` signal, as one tab should see it."""
        return self.locks.view(self.exclusive_pvs, tab=tab, user=user)

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
                # How a write control learns that its PV is exclusive, and
                # which entry of `_locks` it follows (`controls.lock_strip`).
                lock_key=self.locks.key,
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
        camera_gateway: str | None = "",
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
            link_banner=self.render_widget(self.link_banner, reader),
            signals_json=json.dumps(self.signals(palette, user=user or ""), separators=(",", ":")),
            stream_url=self.gui.stream_url,
            # A hidden tab is still the tab that holds control. Datastar closes
            # a hidden tab's stream by default, which would let its locks lapse
            # while the operator looks at another tab, and drop the "taken
            # over by" notice; a screen with an exclusive PV keeps it open.
            stream_hidden=bool(self.exclusive_pvs),
            backend_label=backend_label,
            toast_seconds=TOAST_SECONDS,
            palette=palette,
            palettes=PALETTES,
            user=user,
            camera_socket=self.camera_socket(camera_gateway),
        )

    def camera_socket(self, gateway: str | None = "") -> str:
        """Where this screen's camera frames come from, or "" for a screen
        with no camera (which then loads no camera script at all).

        `gateway` is the camera gateway's base URL when it runs as its own
        process; "" means this app serves the cameras itself, and `None` that
        nothing does (`CAMERA_GATEWAY=off`).
        """
        if gateway is None or not self.gui.cameras():
            return ""
        return gateway.rstrip("/") + CAMERA_SOCKET_PATH

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


def build_pages(zone: Zone, env: Environment, locks: LockTable | None = None) -> dict[str, Page]:
    """One `Page` per GUI in the zone, keyed by slug, sharing one lock table."""
    locks = locks if locks is not None else LockTable(zone.exclusive_pvs())
    return {gui.slug: Page(zone, gui, env, locks) for gui in zone.guis}


def all_pvs(pages: Sequence[Page]) -> set[PvId]:
    pvs: set[PvId] = set()
    for page in pages:
        pvs |= page.all_pvs
    return pvs
