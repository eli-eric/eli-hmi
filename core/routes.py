"""HTTP surface: one page and one stream per GUI, and one write endpoint.

    GET  /                   redirect to the zone's first screen
    GET  /<gui>              the screen, server-rendered from the hub's cache
    GET  /<gui>/stream       Datastar SSE — element patches as PVs report
    POST /api/write          one PV write, with the result patched back

Every one of them requires a session; the gate is in `core.login`, not here, so
a screen added tomorrow is protected without anyone remembering to protect it.

Routes are registered from the zone's folders, so adding a screen is adding a
folder — there is nothing here to edit. `/api/write` is deliberately the only
write route: a command PV and a direct device PV are the same operation (write
a value to a record), and the difference between them belongs to the control
system that receives it, not to the UI that triggers it.
"""

from __future__ import annotations

import asyncio
import logging
from html import escape
from typing import Any, AsyncIterator

from datastar_py import ServerSentEventGenerator as SSE
from datastar_py.consts import ElementPatchMode
from datastar_py.quart import DatastarResponse, read_signals
from quart import Blueprint, Response, current_app, g, make_response, redirect, request

from core.auth import Identity
from core.components import PvReader, WriteRule
from core.epics.hub import PvHub
from core.epics.types import PvDescription, PvId
from core.page import Page
from core.palette import DEFAULT_PALETTE, PALETTE_COOKIE, PALETTES, usable
from core.settings import Settings

logger = logging.getLogger(__name__)


def state() -> tuple[Settings, PvHub, dict[str, Page]]:
    """Settings, hub and screens for the app handling this request.

    Through `current_app` rather than a module global, so two apps in one
    process — which is what the test suite is — never share a hub.
    """
    hmi = current_app.hmi
    return hmi.settings, hmi.hub, hmi.pages


def actor() -> Identity | None:
    """Who is asking. Put on `g` by the gate (`core.login.install_gate`) and by
    nothing else, so a write can never be attributed to a name the request
    supplied for itself."""
    return getattr(g, "identity", None)


def build_blueprint(pages: dict[str, Page], *, home: str) -> Blueprint:
    """A blueprint carrying every screen in the zone plus the write endpoint."""
    screens = Blueprint("screens", __name__)

    @screens.get("/")
    async def index():
        return redirect(home, code=307)

    for slug in pages:
        _add_gui_routes(screens, slug)

    screens.add_url_rule("/api/write", "write", write, methods=["POST"])
    screens.add_url_rule("/api/waveforms", "waveforms", waveforms, methods=["GET"])
    screens.add_url_rule("/api/register", "register", register_panel, methods=["GET"])
    screens.add_url_rule("/api/palette", "palette", set_palette, methods=["POST"])
    return screens


def current_palette(settings: Settings) -> str | None:
    """The workstation's choice, else the station default from `PALETTE`."""
    chosen = request.cookies.get(PALETTE_COOKIE)
    if chosen is not None:
        return usable(chosen)
    return usable(settings.palette)


async def set_palette() -> Response:
    """Remember the palette this workstation wants. Nothing else.

    The screen has already changed by the time this arrives: `<html>` binds
    its `data-palette` to the signal the selector writes, and the tone layer
    is pure CSS keyed off that attribute. This only makes the choice outlast
    the page, and deliberately sends no redirect — reloading would collapse
    every list an operator had expanded, which is the one thing changing a
    colour must not do.
    """
    value = (request.args.get("value") or "").strip()
    who = actor()
    logger.info("palette %r chosen by user=%s", value, who.user if who else "-")
    response = await make_response(DatastarResponse([]))
    response.set_cookie(
        PALETTE_COOKIE,
        value if value in PALETTES else DEFAULT_PALETTE,
        max_age=365 * 24 * 3600,
        httponly=True,
        samesite="Lax",
    )
    return response


def _add_gui_routes(blueprint: Blueprint, slug: str) -> None:
    """Register one screen. Bound per slug rather than matched by a path
    parameter, so an unknown path is a 404 from the router instead of a page
    that renders empty.
    """

    async def page() -> Response:
        """Server-side render of the whole screen.

        Rendered from the hub's cache, so the first paint shows real values: in
        a control room a page that renders placeholders and fills them in after
        a round-trip reads as "the system is down" for the second it takes.
        """
        settings, hub, pages = state()
        view = pages[slug]
        reader = PvReader(hub.snapshot(view.all_pvs), hub.link_ok)
        who = actor()
        html = view.render(
            reader,
            backend_label=settings.backend_label,
            palette=current_palette(settings),
            user=who.user if who else None,
        )
        return Response(html, content_type="text/html; charset=utf-8")

    async def stream() -> DatastarResponse:
        """Open the live stream.

        Everything the generator needs is read here, inside the request, and
        closed over. The generator outlives the request scope by design — it is
        the response — so reaching for `request` from inside it would need
        Quart's `stream_with_context` and tie a shift-long stream to machinery
        it does not otherwise care about.
        """
        settings, hub, pages = state()
        who = actor()
        return DatastarResponse(
            _stream_events(
                slug,
                pages[slug],
                hub,
                settings,
                user=who.user if who else "-",
                shutting_down=current_app.hmi.shutting_down,
            )
        )

    blueprint.add_url_rule(f"/{slug}", f"page_{slug}", page, methods=["GET"])
    blueprint.add_url_rule(f"/{slug}/stream", f"stream_{slug}", stream, methods=["GET"])


def _component(key: str) -> Any:
    """The component with this key, from whichever page holds it."""
    _settings, _hub, pages = state()
    return next(
        (
            candidate
            for page in pages.values()
            for candidate in page.gui.walk()
            if candidate.key == key
        ),
        None,
    )


async def register_panel() -> DatastarResponse:
    """Open the write panel on one register of one device.

    One panel for a whole tree rather than a control on every row: a module
    has dozens of registers, most of them readings, and a control per row
    would mean asking the device for hundreds of sets of limits nobody is
    looking at.
    """
    key = (request.args.get("component") or "").strip()
    pv = (request.args.get("pv") or "").strip()
    component = _component(key)
    if component is None or not hasattr(component, "register"):
        logger.warning("register panel refused: no register tree %r", key)
        return DatastarResponse([])

    item = component.register(pv)
    if item is None or not item.write:
        # Not a register of this tree, or not one that can be written. Either
        # way the panel is cleared rather than left showing the last one.
        logger.warning("register panel refused: %r is not a setpoint of %r", pv, key)
        item = None

    # What the device will accept, asked for now rather than monitored: the
    # control fields are a heavier read and a module has hundreds of
    # registers, so they are read for the one being written.
    _settings, hub, pages = state()
    described = (
        await hub.describe(PvId(item.pv))
        if item is not None and component.has_control_fields(item)
        else PvDescription()
    )
    # What this register takes: the component decides, from the register's
    # declared kind and the device's answer. The panel is built from this
    # same rule, so the field an operator sees and the endpoint that guards
    # the write cannot disagree about what the register is.
    rule = (
        component.write_rule(item, described) if item is not None else WriteRule.text()
    )
    if item is not None:
        # Recorded against the record the write goes to. The field greys out
        # its Confirm from the same rule, but this endpoint is the one route
        # to a write and anything that can post to it can post anything.
        # Replaced on every selection, so a device that has been reconfigured
        # is answered for afresh.
        current_app.hmi.write_limits[item.write_pv] = rule

    # The arming control is a live widget, rendered into the panel rather than
    # standing apart from it: what it reports is the device's state. Only for
    # a register that takes an NV write — for any other there is nothing to
    # arm, and an indicator beside its field would report a state that does
    # not concern the write being made.
    nv = ""
    widget = component.widgets.get("nv")
    if widget is not None and item is not None and item.nv:
        page = next(
            (p for p in pages.values() if component in list(p.gui.walk())), None
        )
        if page is not None:
            reader = PvReader(hub.snapshot(page.all_pvs), hub.link_ok)
            nv = page.render_widget(widget, reader)

    markup = current_app.hmi.jinja.get_template(
        "register_tree/write_panel.html"
    ).render(
        comp=component,
        c=component.config,
        register=item,
        described=described,
        rule=rule,
        nv=nv,
    )
    who = actor()
    logger.info(
        "register %s selected by user=%s", pv, who.user if who else "-"
    )
    return DatastarResponse(
        [
            # Which register's panel is open, so the slot under that row is
            # the one shown. Per browser: this answer goes to the operator who
            # asked, not down the shared stream.
            SSE.patch_signals(
                {
                    component.selected: pv if item is not None else "",
                    # Choosing a register is starting a new write. One signal
                    # carries the value for whichever register is open, so a
                    # number typed for the last one would otherwise still be
                    # loaded — a field reading blank with Confirm live, and
                    # the old number going to the new record.
                    component.set_register: "",
                }
            ),
            # Every slot emptied before one is filled, so the page holds one
            # panel at a time. A hidden slot that kept its last panel kept a
            # copy of the live NV widget too, under the same id as the one
            # being shown — and a live update lands on the first element with
            # that id, which could be the stale one nobody can see.
            SSE.remove_elements(selector=".register-write > *"),
            SSE.patch_elements(
                str(markup),
                selector=f"#{component.slot(pv)}",
                mode=ElementPatchMode.INNER,
            ),
        ]
    )


async def waveforms() -> DatastarResponse:
    """Re-read one component's device catalog and patch its options in place.

    Asked for when the control is opened, because the list a device serves
    changes while the machine runs. The patch goes INSIDE the `<select>`, so
    the element, its binding and anything typed beside it all survive; only
    the options change.
    """
    key = (request.args.get("component") or "").strip()
    _settings, _hub, pages = state()
    component = next(
        (
            candidate
            for page in pages.values()
            for candidate in page.gui.walk()
            if candidate.key == key
        ),
        None,
    )
    if component is None:
        logger.warning("catalog refresh refused: no component %r", key)
        return DatastarResponse([])

    await component.warm()
    options = component.context().get("waveforms") or []
    # Rendered from the same macro the control itself uses: this patch replaces
    # the whole option list, so a second copy of the markup here is a second
    # definition of what the control looks like.
    markup = current_app.hmi.jinja.get_template("choices.html").module.options(options)
    return DatastarResponse(
        [
            # Whether anything can be sent travels with the list: a device that
            # has stopped offering waveforms must take the Confirm buttons with
            # it, or they stay live over a selection the device no longer has.
            SSE.patch_signals(
                {component.context()["waveforms_available"]: bool(options)}
            ),
            SSE.patch_elements(
                str(markup),
                # Every control showing this laser's catalog, not one of
                # them: a selector patch lands in each match, an id in one.
                selector=f'[data-waveforms="{key}-waveforms"]',
                mode=ElementPatchMode.INNER,
            )
        ]
    )


async def _wait_for_change(
    subscription, timeout: float, shutting_down: asyncio.Event
) -> tuple[set, bool]:
    """Wait for a PV to change, the heartbeat to fire, or the process to stop.

    Returns `(dirty, stopping)`. The shutdown arm is what lets Ctrl-C work: an
    SSE response is a connection that never completes on its own, and
    Hypercorn's shutdown waits for every connection to be dropped, so a stream
    that only ever woke on PV changes deadlocked the process against the
    browser (see `_shutdown_trigger`).

    Cancelling the waiter loses nothing: `Subscription.wait` only clears the
    wakeup and drains `_dirty` after it returns, so an interrupted wait leaves
    both for the next caller — and here there is no next caller anyway.
    """
    waiter = asyncio.ensure_future(subscription.wait(timeout=timeout))
    stopping = asyncio.ensure_future(shutting_down.wait())
    try:
        done, _ = await asyncio.wait(
            {waiter, stopping}, return_when=asyncio.FIRST_COMPLETED
        )
    finally:
        for task in (waiter, stopping):
            if not task.done():
                task.cancel()
    if waiter in done:
        return waiter.result(), shutting_down.is_set()
    return set(), True


async def _stream_events(
    slug: str,
    view: Page,
    hub: PvHub,
    settings: Settings,
    *,
    user: str,
    shutting_down: asyncio.Event | None = None,
):
    """The live half of a screen.

    One subscription per open tab, sharing the hub's monitors. The loop is the
    whole client-side reactivity budget:

      1. wait for a PV to change (or for the heartbeat to fire);
      2. let a burst settle for `RENDER_INTERVAL`, so one IOC scan is one render;
      3. re-render only the widgets that read a changed PV;
      4. push them as a single `patch-elements` event.

    The heartbeat resets `$_age`, the browser's staleness watchdog. That is what
    makes a dead stream visible: without it a frozen page looks exactly like a
    quiet machine.

    A closed tab arrives here as `GeneratorExit` or `CancelledError` when the
    server stops iterating the response, which is why the subscription is closed
    in a `finally` rather than by polling for a disconnect.

    A stopping *server* arrives as `shutting_down`, and the loop returns rather
    than waiting to be cancelled — nothing cancels it, because the shutdown is
    waiting for this very response to finish.
    """
    stopping = shutting_down or asyncio.Event()
    subscription = await hub.subscribe(view.all_pvs)
    logger.info(
        "SSE stream opened for /%s by user=%s (%d PVs, %d monitors, %d streams)",
        slug,
        user,
        len(view.all_pvs),
        hub.monitor_count,
        hub.subscriber_count,
    )
    try:
        reader = PvReader(subscription.snapshot(), hub.link_ok)
        yield SSE.patch_signals({"_age": 0})
        yield SSE.patch_elements(view.render_all_widgets(reader))

        while not stopping.is_set():
            dirty, stop_now = await _wait_for_change(
                subscription, settings.heartbeat_seconds, stopping
            )
            if stop_now:
                return
            if dirty:
                # Collect the rest of the burst before rendering: IOCs report a
                # scan's worth of records at once, and the operator should see
                # the screen move as a unit.
                await asyncio.sleep(settings.render_interval)
                dirty |= subscription.drain()

            reader = PvReader(subscription.snapshot(), hub.link_ok)
            yield SSE.patch_signals({"_age": 0})

            if not dirty:
                # Heartbeat tick: nothing changed, but the link state may have.
                yield SSE.patch_elements(view.render_link_banner(reader))
                continue

            patch = view.render_patch(reader, dirty)
            if patch:
                yield SSE.patch_elements(patch)
    finally:
        await subscription.close()
        logger.info(
            "SSE stream closed for /%s by user=%s (%d left)",
            slug,
            user,
            hub.subscriber_count,
        )


async def write() -> DatastarResponse:
    """Write one value to one PV.

    Two forms, matching the two kinds of control: `value` is fixed by the button
    ("Open" writes 1), `signal` names the Datastar signal the operator typed
    into (a delay in ns, a waveform name). Datastar sends every signal with the
    request, so the second form needs no separate body contract.
    """
    _settings, hub, _pages = state()
    who = actor()
    user = who.user if who else "-"

    name = (request.args.get("pv") or "").strip()
    value = request.args.get("value")
    signal = request.args.get("signal")
    # Where this control shows what happened, and the panel to shut once the
    # write lands. Absent for a write with no control behind it, which falls
    # back to the header toast.
    status = (request.args.get("status") or "").strip() or None
    close = (request.args.get("close") or "").strip() or None

    if not name or len(name) > 256 or any(character.isspace() for character in name):
        logger.warning("write refused user=%s pv=%r reason=unusable-pv-name", user, name)
        return _report(f"Refused: '{name}' is not a usable PV name.", status)

    if signal is not None:
        signals = await read_signals()
        raw: Any = (signals or {}).get(signal)
        if raw is None or (isinstance(raw, str) and not raw.strip()):
            logger.info("write skipped user=%s pv=%s reason=empty-field", user, name)
            return _report("Nothing to write — enter a value first.", status, pv=name)
    elif value is None:
        # Neither form. Writing the string "None" — which is what falling
        # through would do — is worse than refusing: it reaches the device.
        logger.warning("write refused user=%s pv=%s reason=no-value", user, name)
        return _report(f"Refused: no value given for {name}.", status, pv=name)
    else:
        raw = value

    # What the component that owns this control declared the PV takes. One
    # question, asked here rather than only in the field, because this
    # endpoint is the one route every write takes — a stale tab, a second
    # browser, a curl. A PV nobody declared takes text, unchecked: it was
    # never registered as writable, and there is nothing to check it against.
    rule = current_app.hmi.write_limits.get(name) or WriteRule.text()
    payload, refusal = rule.resolve(raw)
    if refusal is not None:
        logger.warning(
            "write refused user=%s pv=%s value=%r kind=%s reason=%s",
            user,
            name,
            raw,
            rule.kind,
            refusal,
        )
        return _report(f"Refused: {refusal}.", status, pv=name)

    try:
        await hub.caput(name, payload)
    except Exception as exc:  # noqa: BLE001 - surfaced to the operator verbatim
        # `exception` for the traceback, and the actor on the same line: a write
        # that failed is the first thing asked about after a shift handover.
        logger.exception("write FAILED user=%s pv=%s value=%r", user, name, payload)
        return _report(f"{name}: write failed — {exc}", status, pv=name)

    # The audit line. One per write, with who, what and to where — the reason
    # `/api/write` is the only write path in the app.
    logger.info("write ok user=%s pv=%s value=%r", user, name, payload)
    return _report(f"{name} ← {payload}", status, ok=True, close=close, reset_age=True)


def _report(
    message: str,
    target: str | None,
    *,
    ok: bool = False,
    close: str | None = None,
    reset_age: bool = False,
    pv: str | None = None,
) -> DatastarResponse:
    """Say what happened, beside the control that caused it when it named one.

    Only failures are shown there. A successful write needs no commentary —
    the value it changed is already on screen — so the line is cleared and the
    cog panel shuts. A failure leaves the panel open, because the message
    lives inside it and an operator cannot read what has just been hidden.

    The header toast still records every write, successes included; it is the
    log of what this session did, not the answer to "did my press work".

    A failure that names its `pv` also puts the screen right: controls are
    optimistic — a checkbox ticks when pressed, not when the device confirms
    — so after a refusal a control may be showing what the operator meant
    rather than what the device holds. The PV is read again and everything
    displaying it is redrawn from the answer (`_redraw_from_device`).
    """
    events: list[Any] = [_toast_event(message, reset_age=reset_age)]
    if target:
        # The message alone: it sits under the control that caused it, so the
        # PV name is redundant there — and long enough to overflow the panel.
        text = "" if ok else escape(message.removeprefix("Refused: "))
        events.append(
            SSE.patch_elements(f'<span class="control-status" id="{target}">{text}</span>')
        )
    if ok and close:
        events.append(SSE.patch_signals({close: False}))
    if ok or pv is None:
        return DatastarResponse(events)
    redraw = _redraw_from_device(pv)

    async def said_then_put_right() -> AsyncIterator[Any]:
        # The message first, the read after it. A channel that just refused a
        # write may not answer a read either, and an operator should not sit
        # out a second timeout to learn about the first.
        for event in events:
            yield event
        async for event in redraw:
            yield event

    return DatastarResponse(said_then_put_right())


def _redraw_from_device(name: str) -> AsyncIterator[Any]:
    """Every widget that displays `name`, redrawn from a fresh read of it.

    `caget`, not the cache: the monitor reports changes, and a write the
    device refused changed nothing — so there is no update coming that would
    put an optimistic control back. One read per datatype the PV is shown at,
    and each widget drawn once however many pages carry it.

    Resolved now, iterated later: the response streams after the view has
    returned, where the request's app context may be gone.
    """
    _settings, hub, pages = state()

    async def redraw() -> AsyncIterator[Any]:
        fresh: dict[PvId, Any] = {}
        drawn: set[str] = set()
        parts: list[str] = []
        for page in pages.values():
            for pv in page.all_pvs:
                if pv.name != name:
                    continue
                widgets = [w for w in page.widgets_for([pv]) if w.id not in drawn]
                if not widgets:
                    continue
                if pv not in fresh:
                    fresh[pv] = await hub.caget(pv)
                reader = PvReader(
                    {**hub.snapshot(page.all_pvs), pv: fresh[pv]}, hub.link_ok
                )
                for widget in widgets:
                    drawn.add(widget.id)
                    parts.append(str(page.render_widget(widget, reader)))
        if parts:
            yield SSE.patch_elements("\n".join(parts))

    return redraw()


def _toast(message: str, *, reset_age: bool = False) -> DatastarResponse:
    """Say what happened, then get out of the way.

    The response returns immediately. Holding it open to send a "now clear the
    message" event later would keep Datastar's `data-indicator` true for the
    whole time, so a successful write would read as still in flight for as long
    as its own confirmation was on screen. Instead the message carries a counter
    that the page's one-second tick ages out (`$_toast_age`), which costs
    nothing and cannot get stuck.
    """
    return DatastarResponse([_toast_event(message, reset_age=reset_age)])


def _toast_event(message: str, *, reset_age: bool = False):
    signals: dict[str, Any] = {"_toast": message, "_toast_age": 0}
    if reset_age:
        # A successful write is proof the server is alive, so it also resets the
        # stream watchdog rather than waiting for the next heartbeat.
        signals["_age"] = 0
    return SSE.patch_signals(signals)
