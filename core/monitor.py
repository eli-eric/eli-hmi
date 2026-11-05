"""`/monitor` — what the process is doing, for whoever is asking why a station
misbehaves.

    GET  /monitor            the dashboard, server-rendered
    GET  /monitor/stream     Datastar SSE — panels patched as they change
    GET  /monitor/logs.txt   the log book as text, for a ticket

The one screen that is not a zone folder. It reads state the rest of the app
already keeps — the hub's monitors, the open streams, the log book — and owns
none of its own, so it cannot disagree with what the screens are doing.

Behind the same gate as every screen (`core.login`): any signed-in user may
open it. It shows other users' names and addresses, which every console line
already does.

`collect()` turns that state into plain rows; `monitor_panels.html` has one
macro per panel, used for the first paint and for every patch, so the two are
byte-identical — the same rule the screens follow.
"""

from __future__ import annotations

import asyncio
import logging
import os
import platform
import re
import socket
import sys
import threading
import time
from dataclasses import dataclass
from datetime import datetime
from itertools import islice

from datastar_py import ServerSentEventGenerator as SSE
from datastar_py.consts import ElementPatchMode
from datastar_py.quart import DatastarResponse
from markupsafe import Markup, escape
from quart import Blueprint, Response, current_app, request

from core.clients import Client
from core.epics.hub import MonitorInfo
from core.epics.types import PvSample
from core.locks import Held, clock_time
from core.logbook import LogEntry
from core.login import client_ip
from core.render.severity import (
    DISCONNECTED_TEXT,
    SEVERITY_NONE,
    describe_pv,
    describe_severity,
    describe_status,
    log_tone,
    severity_tone,
)
from core.routes import actor, current_palette

logger = logging.getLogger(__name__)

#: The slug the nav bar compares against, and the folder name no zone may use.
SLUG = "monitor"


@dataclass(frozen=True)
class _Tool:
    """Stands in for a `Gui` where `base.html` asks which screen this is."""

    slug: str = SLUG
    title: str = "Monitor"


# ------------------------------------------------------------------ view model


@dataclass(frozen=True)
class ClientRow:
    id: int
    kind: str
    user: str
    ip: str
    browser: str
    user_agent: str
    slug: str
    connected_for: str
    events: int
    last_event: str


@dataclass(frozen=True)
class ScreenRow:
    slug: str
    title: str
    streams: int
    users: str
    components: int
    widgets: int
    pvs: int


@dataclass(frozen=True)
class LockRow:
    """One exclusive PV someone holds: who, from where, since when."""

    pv: str
    user: str
    ip: str
    screen: str
    #: `14:02`, and how long ago that was.
    since: str
    held_for: str
    #: The first characters of the tab id — enough to tell two tabs apart.
    tab: str
    #: "held", or "lapses in 42s" once no screen in that tab shows it.
    state: str
    lapsing: bool


@dataclass(frozen=True)
class MonitorRow:
    name: str
    datatype: str
    refs: int
    #: "OK", "MINOR · HIGH", "PV DSC", "waiting" — the condition in words.
    state: str
    #: The tone layer's name for it (`core.render.severity`), None when healthy.
    tone: str | None
    #: The same hover text a readout of this PV carries on its screen.
    title: str | None
    value: str
    updates: int
    last_update: str
    error: str
    #: Disconnected, INVALID or in alarm: sorted to the top, kept by the
    #: "problems only" filter.
    problem: bool


@dataclass(frozen=True)
class LogRow:
    seq: int
    #: `11:53:20.815`, and the full date for the tooltip.
    clock: str
    stamp: str
    level: str
    tone: str | None
    logger: str
    #: The logger without its `core.` prefix — the column is narrow.
    source: str
    #: auth / writes / streams / epics / app — what the category chips filter on.
    category: str
    message: Markup
    exc: str | None
    #: Logged by an earlier run of the process, read back from `LOG_DIR`.
    earlier: bool
    #: The first entry (newest first) before a restart — a divider goes above it.
    restart_above: bool = False


@dataclass(frozen=True)
class Overview:
    zone: str
    zone_resolved_by: str
    backend: str
    auth: str
    started: str
    uptime: str
    link_ok: bool
    #: Screen streams open, and how many distinct users hold them.
    streams: int
    users: int
    monitors: int
    disconnected: int
    alarms: int
    #: Records logged at that level since this process started.
    errors: int
    warnings: int
    #: (label, value) pairs: what is running, and how it was configured.
    process: list[tuple[str, str]]
    config: list[tuple[str, str]]


@dataclass(frozen=True)
class MonitorView:
    overview: Overview
    clients: list[ClientRow]
    screens: list[ScreenRow]
    monitors: list[MonitorRow]
    log: list[LogRow]
    #: Exclusive PVs someone holds, and how many exclusive PVs there are.
    locks: list[LockRow] = ()
    exclusive: int = 0


#: Worst first. A dead channel outranks an INVALID one — they share a tone, but
#: a transport failure is the more specific and more actionable of the two.
#: `unknown` (nothing has arrived yet) sits above healthy: normal for a second
#: at start-up, worth a look if it lasts.
_DISCONNECTED_RANK = 5
_TONE_RANK = {"invalid": 4, "error": 3, "warning": 2, "unknown": 1, "none": 0}


def _monitor_row(info: MonitorInfo, now: float) -> tuple[int, MonitorRow]:
    sample = info.sample
    tone = severity_tone(sample)
    disconnected = sample is not None and not sample.ok
    if sample is None:
        state = "waiting"
    elif disconnected:
        state = DISCONNECTED_TEXT
    elif sample.severity == SEVERITY_NONE:
        state = "OK"
    else:
        status = describe_status(sample.status)
        state = describe_severity(sample.severity) + (f" · {status}" if status else "")
    rank = _DISCONNECTED_RANK if disconnected else _TONE_RANK[tone]
    row = MonitorRow(
        name=info.pv.name,
        datatype=info.pv.datatype.value,
        refs=info.refs,
        state=state,
        tone=None if tone == "none" else tone,
        title=describe_pv(sample, pv_name=info.pv.name),
        value=_short_value(sample),
        updates=info.updates,
        last_update=ago(now, info.received_at),
        error=(sample.error or "") if sample is not None else "",
        problem=rank >= _TONE_RANK["warning"],
    )
    return rank, row


def _short_value(sample: PvSample | None, limit: int = 40) -> str:
    """The reading as a table cell has room for: a waveform as its length,
    a float to six significant figures, anything long cut short."""
    if sample is None or sample.value is None:
        return "-"
    value = sample.value
    if hasattr(value, "__len__") and not isinstance(value, (str, bytes)):
        text = f"[{len(value)} values]"
    elif isinstance(value, float):
        text = f"{value:.6g}"
    else:
        text = str(value)
    if len(text) > limit:
        text = text[: limit - 1] + "…"
    return f"{text} {sample.units}" if sample.units else text


def collect(
    hmi, now: float | None = None, *, loop_lag: float | None = None, log: bool = True
) -> MonitorView:
    """Everything the dashboard shows, read from the app's own state.

    `loop_lag` is how late the dashboard's own stream last woke — the one
    measurement here that only a running stream can take. `log=False` skips
    the log rows, which a stream tick does not re-send.
    """
    now = time.time() if now is None else now
    active = hmi.clients.active()
    infos = hmi.hub.monitors()
    ranked = [_monitor_row(info, now) for info in infos]
    entries = hmi.logbook.entries()[-LOG_SHOWN:] if log else []
    return MonitorView(
        overview=_overview(hmi, now, active, infos, loop_lag),
        clients=[_client_row(client, now) for client in active],
        screens=_screen_rows(hmi.pages, active),
        # Stable over the hub's PV order: worst first, alphabetical within.
        monitors=[row for _rank, row in sorted(ranked, key=lambda pair: -pair[0])],
        log=log_rows(entries, run=hmi.logbook.run),
        locks=[_lock_row(held, now) for held in hmi.locks.held()],
        exclusive=len(hmi.locks.exclusive),
    )


def _lock_row(held: Held, now: float) -> LockRow:
    holder = held.holder
    lapsing = held.lapses_at is not None
    return LockRow(
        pv=held.pv,
        user=holder.user,
        ip=holder.ip,
        screen=holder.screen,
        since=clock_time(holder.since, now=now),
        held_for=duration(now - holder.since),
        tab=holder.tab[:6],
        state=f"lapses in {duration(max(0.0, held.lapses_at - now))}" if lapsing else "held",
        lapsing=lapsing,
    )


def _client_row(client: Client, now: float) -> ClientRow:
    return ClientRow(
        id=client.id,
        kind=client.kind,
        user=client.user,
        ip=client.ip,
        browser=client.browser,
        user_agent=client.user_agent,
        slug=client.slug,
        connected_for=duration(now - client.opened_at),
        events=client.events,
        last_event=ago(now, client.last_event_at),
    )


def _screen_rows(pages, active: list[Client]) -> list[ScreenRow]:
    rows = []
    for slug, page in pages.items():
        watching = [c for c in active if c.kind == "screen" and c.slug == slug]
        rows.append(
            ScreenRow(
                slug=slug,
                title=page.gui.title,
                streams=len(watching),
                users=", ".join(sorted({c.user for c in watching})) or "-",
                **page.sizes(),
            )
        )
    return rows


def _overview(
    hmi, now: float, active: list[Client], infos: list[MonitorInfo], loop_lag: float | None
) -> Overview:
    screens = [client for client in active if client.kind == "screen"]
    samples = [info.sample for info in infos if info.sample is not None]
    return Overview(
        zone=hmi.zone.code,
        zone_resolved_by=hmi.zone.resolved_by,
        backend=hmi.settings.backend_label,
        auth=hmi.authenticator.mode,
        started=datetime.fromtimestamp(hmi.started_at).strftime("%Y-%m-%d %H:%M:%S"),
        uptime=duration(now - hmi.started_at),
        link_ok=hmi.hub.link_ok,
        streams=len(screens),
        users=len({client.user for client in screens}),
        monitors=len(infos),
        disconnected=sum(1 for s in samples if not s.ok),
        alarms=sum(1 for s in samples if s.ok and s.severity > SEVERITY_NONE),
        errors=hmi.logbook.counts["ERROR"] + hmi.logbook.counts["CRITICAL"],
        warnings=hmi.logbook.counts["WARNING"],
        process=_process_facts(loop_lag),
        config=_config_facts(hmi.settings),
    )


def _process_facts(loop_lag: float | None) -> list[tuple[str, str]]:
    facts = [
        ("PID", str(os.getpid())),
        ("Host", socket.gethostname()),
        ("Python", platform.python_version()),
        ("Peak memory", _peak_memory()),
        ("Threads", str(threading.active_count())),
    ]
    try:
        facts.append(("Asyncio tasks", str(len(asyncio.all_tasks()))))
    except RuntimeError:  # no running loop: a test calling `collect` bare
        pass
    if loop_lag is not None:
        facts.append(("Loop lag", f"{loop_lag * 1000:.0f} ms"))
    return facts


def _peak_memory() -> str:
    """Peak resident set size. `ru_maxrss` is KiB on Linux and bytes on macOS;
    Windows has no `resource` module at all."""
    try:
        import resource
    except ImportError:  # pragma: no cover - Windows
        return "-"
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    if sys.platform != "darwin":
        peak *= 1024
    return f"{peak / 2**20:.0f} MiB"


#: Channel Access configuration worth seeing when a station cannot reach a PV.
_CA_ENVIRONMENT = ("EPICS_CA_ADDR_LIST", "EPICS_CA_AUTO_ADDR_LIST", "EPICS_CA_SERVER_PORT")


def _config_facts(settings) -> list[tuple[str, str]]:
    facts = [
        ("Render interval", f"{settings.render_interval:g} s"),
        ("Heartbeat", f"{settings.heartbeat_seconds:g} s"),
        ("Prewarm", "on" if settings.prewarm else "off"),
        ("Session", f"{settings.session_hours:g} h"),
        ("Log level", settings.log_level),
        ("Log directory", settings.log_dir or "none — memory only"),
        ("DEV", "on" if settings.dev else "off"),
    ]
    facts += [(name, os.environ[name]) for name in _CA_ENVIRONMENT if os.environ.get(name)]
    return facts


# ------------------------------------------------------------------------- log

#: How many lines the page holds. The stream trims to this as it prepends; the
#: whole book is in `logs.txt`.
LOG_SHOWN = 500

#: `user=alice`, `pv='X:Y'`, `reason=empty-field` — the app logs in this style
#: (`core.routes`, `core.auth`), so the pairs are what a reader scans for.
_PAIR = re.compile(r"""\b([A-Za-z_][\w.-]*)=('[^']*'|"[^"]*"|[^\s,()]+)""")


def highlight(message: str) -> Markup:
    """The message with each `key=value` pair marked up. Every piece is escaped
    before it is wrapped: a PV name typed into a request reaches the log
    verbatim, and must reach the page as text."""
    parts: list[Markup] = []
    position = 0
    for match in _PAIR.finditer(message):
        parts.append(escape(message[position:match.start()]))
        parts.append(
            Markup('<span class="kv"><span class="k">{}</span>=<span class="v">{}</span></span>')
            .format(match.group(1), match.group(2))
        )
        position = match.end()
    parts.append(escape(message[position:]))
    return Markup("").join(parts)


def category(entry: LogEntry) -> str:
    """Which filter chip a record falls under."""
    if entry.logger == "core.auth":
        return "auth"
    if entry.logger.startswith("core.epics"):
        return "epics"
    if entry.message.startswith(("write ", "palette ")):
        return "writes"
    if "stream" in entry.message:
        return "streams"
    return "app"


def log_rows(entries: list[LogEntry], *, run: str) -> list[LogRow]:
    """Newest first, with a divider wherever the process restarted."""
    rows: list[LogRow] = []
    newer: LogEntry | None = None
    for entry in reversed(entries):
        restarted = newer is not None and newer.run != entry.run
        rows.append(_log_row(entry, run=run, restart_above=restarted))
        newer = entry
    return rows


def _log_row(entry: LogEntry, *, run: str, restart_above: bool = False) -> LogRow:
    moment = datetime.fromtimestamp(entry.time)
    return LogRow(
        seq=entry.seq,
        clock=moment.strftime("%H:%M:%S.") + f"{moment.microsecond // 1000:03d}",
        stamp=moment.strftime("%Y-%m-%d %H:%M:%S"),
        level=entry.level,
        tone=log_tone(entry.levelno),
        logger=entry.logger,
        source=entry.logger.removeprefix("core."),
        category=category(entry),
        message=highlight(entry.message),
        exc=entry.exc,
        earlier=entry.run != run,
        restart_above=restart_above,
    )


def duration(seconds: float) -> str:
    """`42s`, `3m 05s`, `2h 07m`, `3d 04h` — two units, the largest first."""
    seconds = max(0, int(seconds))
    days, rest = divmod(seconds, 86400)
    hours, rest = divmod(rest, 3600)
    minutes, secs = divmod(rest, 60)
    if days:
        return f"{days}d {hours:02d}h"
    if hours:
        return f"{hours}h {minutes:02d}m"
    if minutes:
        return f"{minutes}m {secs:02d}s"
    return f"{secs}s"


def ago(now: float, then: float | None) -> str:
    return "never" if then is None else f"{duration(now - then)} ago"


# ---------------------------------------------------------------------- stream

#: The patched panels, by the id their macro's root carries.
_PANELS = {
    "mon-overview": "overview",
    "mon-clients": "clients",
    "mon-screens": "screens",
    "mon-monitors": "monitors",
    "mon-locks": "locks",
}


def _macros(hmi):
    return hmi.jinja.get_template("monitor_panels.html").module


def _render_panels(hmi, view: MonitorView) -> dict[str, str]:
    macros = _macros(hmi)
    return {panel: str(getattr(macros, name)(view)) for panel, name in _PANELS.items()}


async def monitor_events(hmi, *, user: str, ip: str, user_agent: str):
    """The dashboard's live half.

    Unlike a screen it subscribes to nothing — what it shows is the state of
    the process, not of a PV — so it ticks on the heartbeat instead:

      1. reset `$_age`, the page's staleness watchdog;
      2. re-render each panel and send the ones whose HTML changed;
      3. prepend the log lines logged since the last tick, newest on top, and
         trim the list so a page left open all week stays the same size.

    It is listed in `hmi.clients` as a client of its own, and it ends on
    `hmi.shutting_down` for the same reason a screen's stream does: Hypercorn's
    shutdown waits for every open response (see `core.server._shutdown_trigger`).
    """
    tick = hmi.settings.heartbeat_seconds
    stopping: asyncio.Event = hmi.shutting_down
    loop = asyncio.get_running_loop()
    client = hmi.clients.open(kind="monitor", slug=SLUG, user=user, ip=ip, user_agent=user_agent)
    logger.info("monitor stream opened by user=%s ip=%s", user, ip)

    def sent(event):
        client.sent()
        return event

    try:
        view = collect(hmi)
        seen = view.log[0].seq if view.log else 0
        last = _render_panels(hmi, view)
        yield sent(SSE.patch_signals({"_age": 0}))
        yield sent(SSE.patch_elements("\n".join(last.values())))
        yield sent(
            SSE.patch_elements(
                str(_macros(hmi).log_lines(view.log)),
                selector="#log-lines",
                mode=ElementPatchMode.INNER,
            )
        )

        while not stopping.is_set():
            due = loop.time() + tick
            try:
                await asyncio.wait_for(stopping.wait(), timeout=tick)
                return
            except asyncio.TimeoutError:
                pass
            # How late this wake-up was: anything blocking the event loop
            # delays every stream in the process by the same amount.
            lag = max(0.0, loop.time() - due)

            yield sent(SSE.patch_signals({"_age": 0}))

            panels = _render_panels(hmi, collect(hmi, loop_lag=lag, log=False))
            changed = [html for panel, html in panels.items() if last.get(panel) != html]
            last = panels
            if changed:
                yield sent(SSE.patch_elements("\n".join(changed)))

            fresh = hmi.logbook.entries(after=seen)
            if fresh:
                seen = fresh[-1].seq
                rows = log_rows(fresh[-LOG_SHOWN:], run=hmi.logbook.run)
                yield sent(
                    SSE.patch_elements(
                        str(_macros(hmi).log_lines(rows)),
                        selector="#log-lines",
                        mode=ElementPatchMode.PREPEND,
                    )
                )
                yield sent(SSE.remove_elements(f"#log-lines > :nth-child(n+{LOG_SHOWN + 1})"))
    finally:
        hmi.clients.close(client)
        logger.info("monitor stream closed by user=%s ip=%s", user, ip)


# ---------------------------------------------------------------------- routes


def build_monitor_blueprint() -> Blueprint:
    monitor = Blueprint("monitor", __name__)

    @monitor.get(f"/{SLUG}/logs.txt")
    async def download() -> Response:
        """The whole log book as console-style text — every file under
        `LOG_DIR`, or the in-memory ring without one — to attach to a ticket.

        Read on a worker thread in batches and streamed: a full set of
        rotated files is tens of megabytes, and reading it on the event loop
        would freeze every operator's screen for as long as it took.
        """
        hmi = current_app.hmi
        lines = hmi.logbook.export()

        async def body():
            while batch := await asyncio.to_thread(lambda: list(islice(lines, 5000))):
                yield "".join(batch).encode("utf-8")

        name = f"eli-hmi-{hmi.zone.code}-{datetime.now():%Y%m%d-%H%M}.txt"
        who = actor()
        logger.info("log downloaded by user=%s", who.user if who else "-")
        return Response(
            body(),
            content_type="text/plain; charset=utf-8",
            headers={"content-disposition": f'attachment; filename="{name}"'},
        )

    @monitor.get(f"/{SLUG}/stream")
    async def stream() -> DatastarResponse:
        """Everything the generator needs is read here, inside the request —
        the same rule as a screen's stream (`core.routes`)."""
        who = actor()
        return DatastarResponse(
            monitor_events(
                current_app.hmi,
                user=who.user if who else "-",
                ip=client_ip(),
                user_agent=request.headers.get("user-agent", ""),
            )
        )

    @monitor.get(f"/{SLUG}")
    async def page() -> Response:
        hmi = current_app.hmi
        who = actor()
        html = hmi.jinja.get_template("monitor.html").render(
            zone=hmi.zone,
            menu=hmi.zone.menu(),
            gui=_Tool(),
            backend_label=hmi.settings.backend_label,
            palette=current_palette(hmi.settings),
            user=who.user if who else None,
            view=collect(hmi),
        )
        return Response(html, content_type="text/html; charset=utf-8")

    return monitor
