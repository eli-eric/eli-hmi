"""One screen, rendered: the whole page, or just the parts a change touched.

This is the piece the React app kept in the browser — a component subscribed,
React diffed, the DOM updated. Here the diff is "which widgets read a PV that
changed", looked up in the reverse index built once at start-up, and the DOM
update is a Datastar `patch-elements` event carrying the re-rendered element.

Nothing in here knows what any particular component *is*. It walks the
component tree a GUI's YAML produced, collects widgets and signals, and renders.
"""

from __future__ import annotations

import copy
import json
import asyncio
import logging
import secrets

from dataclasses import dataclass, replace
from typing import Any, Iterable, Sequence

from jinja2 import Environment
from markupsafe import Markup

from cameras.protocol import SOCKET_PATH as CAMERA_SOCKET_PATH
from core.components import Component, Detail, PvReader, Widget
from core.epics import PvId
from core.locks import LockTable
from core.palette import DEFAULT_PALETTE, PALETTES
from core.jinja import WidgetRenderer
from core.zones import Gui, Zone

logger = logging.getLogger(__name__)

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


def written_pvs(gui: Gui) -> frozenset[str]:
    """Every PV a control on this screen can write, from what its components
    declared about their PVs."""
    return frozenset(
        spec.name for spec in gui.all_pv_specs() if spec.writable or spec.command
    )


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
        self.locks = locks if locks is not None else LockTable(zone.control_units())
        #: Every PV a control on this screen can write, from what the
        #: components declared about their PVs.
        self.written_pvs: frozenset[str] = written_pvs(gui)
        #: The exclusive ones: what this screen's `_locks` signal carries and
        #: what its stream keeps alive (`LockTable.watch`).
        self.exclusive_pvs: frozenset[str] = self.written_pvs & self.locks.exclusive

        self._by_pv: dict[PvId, list[Widget]] = {}
        for widget in gui.all_widgets():
            for pv in widget.pvs:
                self._by_pv.setdefault(pv, []).append(widget)

        # Where each component's detail views are fetched from, by view slug.
        # Asked once: building a view builds its components, and a register
        # tree is hundreds of widgets — not something to do per render just
        # to learn a URL.
        self._detail_urls: dict[str, dict[str, str]] = {
            component.key: {
                detail.slug: f"/{detail_slug(gui, component, detail)}"
                for detail in details
            }
            for component in gui.walk()
            if (details := component.details())
        }

    def reindex(self) -> None:
        """Rebuild PV -> widgets, after a component re-declared its widgets."""
        self._by_pv = {}
        for widget in self.gui.all_widgets():
            for pv in widget.pvs:
                self._by_pv.setdefault(pv, []).append(widget)

    def choosable(self, names: Iterable[str]) -> list[str]:
        """The names among these that a workstation can hide on this screen:
        its top-level components', in the screen's order. Nothing on a screen
        that is not `selectable`, and a name it does not have is dropped —
        whether it came from a cookie, a request or an older build."""
        if not self.gui.selectable:
            return []
        wanted = set(names)
        return [c.key for c in self.gui.components if c.key in wanted]

    def unit_for(self, component: Component) -> dict[str, str] | None:
        """The unit of control a component draws the strip for: itself, if it
        is one on this screen, or — in a detail view — the device the view
        belongs to. `{key, unit, name}`: its `_locks` entry, its own key, and
        what Force calls it."""
        unit = self.locks.unit(self.gui.owner or f"{self.gui.slug}/{component.key}")
        if unit is None:
            return None
        return {"key": self.locks.key(unit.key), "unit": unit.key, "name": unit.name}

    def exclusive_pvs_of(self, key: str) -> frozenset[str]:
        """The exclusive PVs one top-level component writes: what hiding or
        showing it moves control of. Empty for a key the screen lacks."""
        component = next((c for c in self.gui.components if c.key == key), None)
        if component is None:
            return frozenset()
        return written_pvs(replace(self.gui, components=[component])) & self.locks.exclusive

    def without(self, keys: Iterable[str]) -> "Page":
        """This screen minus some of its top-level components: what a
        workstation's stream carries when it has hidden them.

        Its PVs and its widgets are only the remaining components', so a
        stream built from it neither subscribes to nor patches what is hidden.
        Only what `choosable` allows is hidden. Cheap — it shares this page's
        renderer and detail URLs, and indexes a handful of components.
        """
        hidden = set(self.choosable(keys))
        if not hidden:
            return self
        narrowed = copy.copy(self)
        narrowed.gui = replace(
            self.gui,
            components=[c for c in self.gui.components if c.key not in hidden],
        )
        narrowed.reindex()
        # Its exclusive PVs too: a stream keeps a tab's lock alive only on
        # what the tab is showing, so control of a hidden component lapses
        # after the grace period, as a closed tab's would (`core.locks`).
        narrowed.written_pvs = written_pvs(narrowed.gui)
        narrowed.exclusive_pvs = narrowed.written_pvs & self.locks.exclusive
        return narrowed

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
        self,
        palette: str | None = None,
        hidden: Sequence[str] = (),
        *,
        tab: str | None = None,
        user: str = "",
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
        signals = {
            **PAGE_SIGNALS,
            "_palette": palette or DEFAULT_PALETTE,
            "_locks": self.lock_view(tab=None, user=user),
            "tab": tab or new_tab_id(),
            **self.gui.signals(),
        }
        if self.gui.selectable:
            # The top-level components this workstation has hidden. Not
            # underscored, because it is sent: it is what the stream is
            # asked for when the page opens it.
            signals["hidden"] = list(hidden)
        return signals

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
        detail_urls = self._detail_urls.get(component.key, {})
        markup = Markup(
            template.render(
                c=component.config,
                # Where each of this component's detail views is fetched
                # from, by slug — `detail_urls['registers']`. Built by the
                # page because only the page knows which screen it is on.
                detail_urls=detail_urls,
                w={role: self.render_widget(widget, reader) for role, widget in component.widgets.items()},
                s=component.signals,
                comp=component,
                # How a write control learns that its PV is exclusive, and
                # which entry of `_locks` it follows (`controls.lock_gate`).
                lock_key=self.locks.key,
                # The unit whose strip this component draws, if it is one.
                unit=self.unit_for(component),
                children=[self.render_component(child, reader) for child in component.children],
                **component.context(),
            )
        )
        if not detail_urls:
            return markup
        # The slot its detail views are patched into, and the component, as
        # one item of the grid: a view takes the component's place and its
        # width. One slot for all of them — the column has room for one
        # thing, so opening a view puts whichever was there aside. The slot comes first so the stylesheet can hide what follows
        # it while it is not empty — a sibling selector, which every browser
        # has, where `:has()` is missing from a Firefox before 121. Empty in
        # the markup, with no whitespace: `:empty` counts a text node.
        return Markup(
            '<div class="view-host"><div class="view-slot" id="{}"></div>{}</div>'
        ).format(detail_slot(component), markup)

    def render(
        self,
        reader: PvReader,
        *,
        backend_label: str,
        palette: str | None = None,
        user: str | None = None,
        hidden: Sequence[str] = (),
        camera_gateway: str | None = "",
    ) -> str:
        # Components are rendered BEFORE the signal list is serialised, and the
        # order matters: a template may create a signal as it goes (the cog on a
        # row of buttons), and `data-signals` has to carry every signal the
        # markup references. A `data-show` pointing at a signal that does not
        # exist yet evaluates against `undefined`, which is how an expandable
        # list ends up rendered open on the first paint.
        rendered = [self.render_component(component, reader) for component in self.gui.components]
        if self.gui.selectable:
            # Each component as one item of the grid, shown while this
            # workstation has not hidden it — and hidden from the first
            # frame when it has, rather than flashing up until Datastar runs.
            rendered = [
                Markup(
                    '<div class="component-choice" data-show="!$hidden.includes(\'{}\')"{}>{}</div>'
                ).format(
                    component.key,
                    Markup(' style="display:none"') if component.key in hidden else "",
                    markup,
                )
                for component, markup in zip(self.gui.components, rendered)
            ]
        template = self._env.get_template("page.html")
        return template.render(
            zone=self.zone,
            gui=self.gui,
            menu=self.zone.menu(),
            components=rendered,
            link_banner=self.render_widget(self.link_banner, reader),
            signals_json=json.dumps(
                self.signals(palette, hidden, user=user or ""), separators=(",", ":")
            ),
            stream_url=self.gui.stream_url,
            # A hidden tab is still the tab that holds control. Datastar closes
            # a hidden tab's stream by default, which would let its locks lapse
            # while the operator looks at another tab, and drop the "taken
            # over by" notice; a screen with an exclusive PV keeps it open.
            stream_hidden=bool(self.exclusive_pvs),
            hidden=hidden,
            # The slot each component's detail views open in, for the ones
            # that have any: hiding the component closes its view.
            view_slots={
                component.key: detail_slot(component)
                for component in self.gui.components
                if self._detail_urls.get(component.key)
            },
            backend_label=backend_label,
            toast_seconds=TOAST_SECONDS,
            palette=palette,
            palettes=PALETTES,
            user=user,
            camera_socket=self.camera_socket(camera_gateway),
        )

    def render_view(self, reader: PvReader) -> str:
        """A detail view: the fragment patched into its component's slot.

        Not a page — it lands inside one — so it carries what a page would
        have given it: its own signals, which the screen never declared, and
        its own stream. The stream is opened by the view and cancelled when
        the view is removed, so its monitors are someone's for exactly as
        long as it is on screen.
        """
        rendered = [self.render_component(component, reader) for component in self.gui.components]
        return self._env.get_template("view.html").render(
            components=rendered,
            signals_json=json.dumps(self.gui.signals(), separators=(",", ":")),
            stream_url=self.gui.stream_url,
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


async def describe_components(hub: Any, pages: dict[str, "Page"]) -> None:
    """Ask the device about the records its components asked about.

    One read per PV, all of them at once, and only for the components that
    said they need it (`Component.describes`). The answers go back through
    `Component.described`, which may re-declare widgets — so every page is
    indexed again afterwards, and this has to happen before anything
    subscribes.
    """
    wanted: dict[str, list[Component]] = {}
    for page in pages.values():
        for component in page.gui.walk():
            for name in component.describes():
                wanted.setdefault(name, []).append(component)
    if not wanted:
        return

    names = list(wanted)
    logger.info("describing %d record(s) for the screens that asked", len(names))
    answers = await asyncio.gather(
        *(hub.describe(PvId(name)) for name in names), return_exceptions=True
    )
    for component in {id(c): c for cs in wanted.values() for c in cs}.values():
        component.described(
            {
                name: answer
                for name, answer in zip(names, answers)
                if component in wanted[name] and not isinstance(answer, Exception)
            }
        )
    for page in pages.values():
        page.reindex()


def describe_on_reconnect(hub: Any, pages: dict[str, "Page"]) -> None:
    """Ask again about a record whose channel has come back.

    Control fields are read once at start-up, so a module that was powered
    down then would be described from nothing for the life of the process —
    its registers reading as indices for the rest of the shift. A component
    keeps what it was told as data, so answering again costs nothing but the
    read.
    """
    wanted: dict[str, list[Component]] = {}
    for page in pages.values():
        for component in page.gui.walk():
            for name in component.describes():
                wanted.setdefault(name, []).append(component)
    if not wanted:
        return

    async def ask(pv: PvId) -> None:
        try:
            description = await hub.describe(pv)
        except Exception:  # noqa: BLE001 - a device that will not answer waits
            logger.warning("could not describe %s after it reconnected", pv.name)
            return
        for component in wanted.get(pv.name, ()):
            component.described({pv.name: description})
        # The reconnect has already been drawn, before this answer existed;
        # the reading may not change again for hours.
        hub.invalidate(pv.name)

    def reconnected(pv: PvId) -> None:
        if pv.name in wanted:
            # The hub's callback must stay cheap: the read happens on its own.
            asyncio.get_running_loop().create_task(ask(pv))

    hub.on_reconnect = reconnected


def build_pages(zone: Zone, env: Environment, locks: LockTable | None = None) -> dict[str, Page]:
    """One `Page` per GUI in the zone, plus one per component detail view,
    all sharing one lock table.

    A detail view is a page like any other as far as its index and its
    stream go — same renderer, same stream, same widgets-by-PV — reached at
    `/<screen>/<component key>/<detail slug>`. What it renders is a fragment,
    patched into the screen in its component's place (`Page.render_view`).
    It is not in the menu: the menu is the zone's folder listing, and a
    detail view is reached from the component that owns it.
    """
    locks = locks if locks is not None else LockTable(zone.control_units())
    pages = {gui.slug: Page(zone, gui, env, locks) for gui in zone.guis}
    for gui in zone.guis:
        for component in gui.walk():
            for detail in component.details():
                slug = detail_slug(gui, component, detail)
                pages[slug] = Page(zone, _detail_gui(gui, slug, component, detail), env, locks)
    return pages


def detail_slug(gui: Gui, component: Component, detail: Detail) -> str:
    """Where a component's detail view is served, under its screen."""
    return f"{gui.slug}/{component.key}/{detail.slug}"


def detail_slot(component: Component) -> str:
    """The id of the element a component's detail views are patched into:
    one per component, whichever view fills it."""
    return f"{component.key}-view"


def _detail_gui(gui: Gui, slug: str, component: Component, detail: Detail) -> Gui:
    """The detail view as a screen, so one `Page` indexes and streams both."""
    return replace(
        gui,
        slug=slug,
        title=detail.title,
        description="",
        components=list(detail.components),
        slot=detail_slot(component),
        owner=f"{gui.slug}/{component.key}",
    )


def all_pvs(pages: Sequence[Page]) -> set[PvId]:
    pvs: set[PvId] = set()
    for page in pages:
        pvs |= page.all_pvs
    return pvs
