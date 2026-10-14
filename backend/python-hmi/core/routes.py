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
import math
import re
from html import escape
from typing import Any

from datastar_py import ServerSentEventGenerator as SSE
from datastar_py.consts import ElementPatchMode
from datastar_py.quart import DatastarResponse, read_signals
from quart import Blueprint, Response, current_app, g, make_response, redirect, request

from core.auth import Identity
from core.components import PvReader
from core.epics.hub import PvHub
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
    screens.add_url_rule("/api/palette", "palette", set_palette, methods=["POST"])
    return screens


def current_palette(settings: Settings) -> str | None:
    """The workstation's choice, else the station default from `PALETTE`."""
    chosen = request.cookies.get(PALETTE_COOKIE)
    if chosen is not None:
        return usable(chosen)
    return usable(settings.palette)


async def set_palette() -> Response:
    """Remember the palette this workstation wants, then reload the screen.

    A redirect rather than a patch: the palette is an attribute on `<html>`,
    and re-rendering the page is both cheaper to reason about than patching
    the document element and exactly what the server-rendered design is for.
    """
    value = (request.args.get("value") or "").strip()
    who = actor()
    logger.info("palette %r chosen by user=%s", value, who.user if who else "-")
    response = await make_response(
        DatastarResponse([SSE.redirect(request.headers.get("Referer") or "/")])
    )
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
            SSE.patch_elements(
                str(markup),
                selector=f"#{key}-waveforms",
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
            return _report("Nothing to write — enter a value first.", status)
    elif value is None:
        # Neither form. Writing the string "None" — which is what falling
        # through would do — is worse than refusing: it reaches the device.
        logger.warning("write refused user=%s pv=%s reason=no-value", user, name)
        return _report(f"Refused: no value given for {name}.", status)
    else:
        raw = value

    limits = current_app.hmi.write_limits.get(name)
    if limits is not None and isinstance(raw, (str, int, float)):
        refusal = limits.rejects_notation(str(raw))
        if refusal is not None:
            logger.warning("write refused user=%s pv=%s value=%r reason=%s", user, name, raw, refusal)
            return _report(f"Refused: {raw} is {refusal}.", status)
        raw = limits.truncate(str(raw))

    try:
        payload = _coerce(raw)
    except ValueError as exc:
        logger.warning("write refused user=%s pv=%s reason=%s", user, name, exc)
        return _report(f"Refused: {exc}", status)

    # The bounds the component that owns this control declared. Checked here
    # rather than only in the field, because this endpoint is the one route
    # every write takes — a stale tab, a second browser, a curl.
    if limits is not None:
        reason = limits.rejects(payload)
        if reason is not None:
            logger.warning(
                "write refused user=%s pv=%s value=%r reason=%s", user, name, payload, reason
            )
            return _report(f"Refused: {payload} is {reason}.", status)

    try:
        await hub.caput(name, payload)
    except Exception as exc:  # noqa: BLE001 - surfaced to the operator verbatim
        # `exception` for the traceback, and the actor on the same line: a write
        # that failed is the first thing asked about after a shift handover.
        logger.exception("write FAILED user=%s pv=%s value=%r", user, name, payload)
        return _report(f"{name}: write failed — {exc}", status)

    # The audit line. One per write, with who, what and to where — the reason
    # `/api/write` is the only write path in the app.
    logger.info("write ok user=%s pv=%s value=%r", user, name, payload)
    return _report(f"{name} ← {payload}", status, ok=True, close=close, reset_age=True)


#: What may be typed into a numeric field. Deliberately not `int()`/`float()`,
#: which accept `1_000` (Python's digit separators), `nan` and `infinity` — none
#: of which an operator meant to type, and all of which would be written to a
#: device. A leading zero is excluded too: "0021" is a code, and turning it into
#: 21 would change what reaches the record.
_NUMBER = re.compile(r"^[+-]?(0|[1-9]\d*)?(\.\d+)?([eE][+-]?\d+)?$")


def _coerce(raw: Any) -> Any:
    """Numbers arrive as strings from a query parameter or a text input. A PV
    that wants a number and gets "1" would be a type error at the CA layer, so
    the conversion happens here, once, and anything else passes through as the
    string it is (a mode PV wanting 'Sleep', say).
    """
    if isinstance(raw, bool):
        return int(raw)
    if isinstance(raw, (int, float)):
        if isinstance(raw, float) and not math.isfinite(raw):
            raise ValueError("a non-finite number cannot be written to a PV")
        return raw
    text = str(raw).strip()
    if not text or not _NUMBER.match(text) or not any(c.isdigit() for c in text):
        return text
    number = float(text)
    return (
        int(number)
        if number.is_integer() and "." not in text and "e" not in text.lower()
        else number
    )


def _report(
    message: str,
    target: str | None,
    *,
    ok: bool = False,
    close: str | None = None,
    reset_age: bool = False,
) -> DatastarResponse:
    """Say what happened, beside the control that caused it when it named one.

    Only failures are shown there. A successful write needs no commentary —
    the value it changed is already on screen — so the line is cleared and the
    cog panel shuts. A failure leaves the panel open, because the message
    lives inside it and an operator cannot read what has just been hidden.

    The header toast still records every write, successes included; it is the
    log of what this session did, not the answer to "did my press work".
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
    return DatastarResponse(events)


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
