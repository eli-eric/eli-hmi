"""HTTP surface: one page and one stream per GUI, and one write endpoint.

    GET  /                   redirect to the zone's first screen
    GET  /<gui>              the screen, server-rendered from the hub's cache
    GET  /<gui>/stream       Datastar SSE — element patches as PVs report
    POST /api/write          one PV write, with the result patched back

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
from typing import Any

from datastar_py import ServerSentEventGenerator as SSE
from datastar_py.fastapi import DatastarResponse, ReadSignals
from fastapi import APIRouter, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from core.components import PvReader
from core.epics.hub import PvHub
from core.page import TOAST_SECONDS, Page
from core.settings import Settings

logger = logging.getLogger(__name__)


def state(request: Request) -> tuple[Settings, PvHub, dict[str, Page]]:
    app = request.app.state
    return app.settings, app.hub, app.pages


def build_router(pages: dict[str, Page]) -> APIRouter:
    """A router carrying every screen in the zone plus the write endpoint."""
    router = APIRouter()
    home = f"/{next(iter(pages))}" if pages else "/"

    @router.get("/", include_in_schema=False)
    async def index() -> RedirectResponse:
        return RedirectResponse(home)

    for slug in pages:
        _add_gui_routes(router, slug)

    router.add_api_route("/api/write", write, methods=["POST"])
    return router


def _add_gui_routes(router: APIRouter, slug: str) -> None:
    """Register one screen. Bound per slug rather than matched by a path
    parameter, so an unknown path is a 404 from the router instead of a page
    that renders empty.
    """

    async def page(request: Request) -> HTMLResponse:
        """Server-side render of the whole screen.

        Rendered from the hub's cache, so the first paint shows real values: in
        a control room a page that renders placeholders and fills them in after
        a round-trip reads as "the system is down" for the second it takes.
        """
        settings, hub, pages = state(request)
        view = pages[slug]
        reader = PvReader(hub.snapshot(view.all_pvs), hub.link_ok)
        return HTMLResponse(
            view.render(reader, backend_label=settings.backend_label, palette=settings.palette)
        )

    async def stream(request: Request) -> DatastarResponse:
        """Open the live stream.

        The generator is handed to `DatastarResponse` rather than returned from
        the route: FastAPI treats an async-generator endpoint as a JSONL stream
        of its own, which would wrap each SSE event in JSON and break the
        protocol.
        """
        return DatastarResponse(_stream_events(request, slug))

    router.add_api_route(f"/{slug}", page, methods=["GET"], response_class=HTMLResponse)
    router.add_api_route(f"/{slug}/stream", stream, methods=["GET"])


async def _stream_events(request: Request, slug: str):
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
    """
    settings, hub, pages = state(request)
    view = pages[slug]
    subscription = await hub.subscribe(view.all_pvs)
    logger.info(
        "SSE stream opened for /%s (%d PVs, %d monitors, %d streams)",
        slug,
        len(view.all_pvs),
        hub.monitor_count,
        hub.subscriber_count,
    )
    try:
        reader = PvReader(subscription.snapshot(), hub.link_ok)
        yield SSE.patch_signals({"_age": 0})
        yield SSE.patch_elements(view.render_all_widgets(reader))

        while True:
            if await request.is_disconnected():
                break
            dirty = await subscription.wait(timeout=settings.heartbeat_seconds)
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
    except asyncio.CancelledError:
        raise
    finally:
        await subscription.close()
        logger.info("SSE stream closed for /%s (%d left)", slug, hub.subscriber_count)


async def write(
    request: Request,
    signals: ReadSignals,
    pv: str = Query(min_length=1, max_length=256),
    value: str | None = Query(default=None),
    signal: str | None = Query(default=None),
) -> DatastarResponse:
    """Write one value to one PV.

    Two forms, matching the two kinds of control: `value` is fixed by the button
    ("Open" writes 1), `signal` names the Datastar signal the operator typed
    into (a delay in ns, a waveform name). Datastar sends every signal with the
    request, so the second form needs no separate body contract.
    """
    _settings, hub, _pages = state(request)
    name = pv.strip()
    if not name or any(character.isspace() for character in name):
        return _toast(f"Refused: '{pv}' is not a usable PV name.")

    if signal is not None:
        raw: Any = (signals or {}).get(signal)
        if raw is None or (isinstance(raw, str) and not raw.strip()):
            return _toast("Nothing to write — enter a value first.")
    elif value is None:
        # Neither form. Writing the string "None" — which is what falling
        # through would do — is worse than refusing: it reaches the device.
        return _toast(f"Refused: no value given for {name}.")
    else:
        raw = value

    try:
        payload = _coerce(raw)
    except ValueError as exc:
        return _toast(f"Refused: {exc}")

    try:
        await hub.caput(name, payload)
    except Exception as exc:  # noqa: BLE001 - surfaced to the operator verbatim
        logger.exception("Write to %s failed", name)
        return _toast(f"{name}: write failed — {exc}")

    logger.info("Wrote %r to %s", payload, name)
    return _toast(f"{name} ← {payload}", reset_age=True)


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


def _toast(message: str, *, reset_age: bool = False) -> DatastarResponse:
    """Say what happened, then get out of the way.

    The response returns immediately. Holding it open to send a "now clear the
    message" event later would keep Datastar's `data-indicator` true for the
    whole time, so a successful write would read as still in flight for as long
    as its own confirmation was on screen. Instead the message carries a counter
    that the page's one-second tick ages out (`$_toast_age`), which costs
    nothing and cannot get stuck.
    """
    signals: dict[str, Any] = {"_toast": message, "_toast_age": 0}
    if reset_age:
        # A successful write is proof the server is alive, so it also resets the
        # stream watchdog rather than waiting for the next heartbeat.
        signals["_age"] = 0
    return DatastarResponse(SSE.patch_signals(signals))
