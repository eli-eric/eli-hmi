"""End-to-end: the page, the SSE stream, and the write path against a live
server — a real Hypercorn socket, the same server a station runs, because the
thing under test is a streaming response and an in-process transport buffers
it.

Every screen is behind a sign-in, so the `client` fixture signs in first — with
the built-in `test`/`test` account, which is what `dev=True` below turns on. The
`anonymous` fixture is the same server without that step, for the tests that are
*about* the gate.
"""

from __future__ import annotations

import asyncio
import hashlib
import html
import json
import logging
import re
from urllib.parse import quote
import socket
import threading
from contextlib import contextmanager
from urllib.parse import urlencode

import pytest

from core.server import create_app, serve_config
from core.settings import Settings


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def accepting(port: int, timeout: float = 15.0) -> bool:
    """Wait until something answers on the port.

    Hypercorn has no `started` flag to poll, and a test that raced the server
    would fail on the first request for reasons that have nothing to do with
    what it is testing.
    """
    deadline = threading.Event()
    for _ in range(int(timeout * 20)):
        with socket.socket() as probe:
            probe.settimeout(0.2)
            if probe.connect_ex(("127.0.0.1", port)) == 0:
                return True
        deadline.wait(0.05)
    return False


@pytest.fixture(scope="module")
def server():
    with running() as url:
        yield url


@contextmanager
def running(**overrides):
    """A real server on a free port, for as long as the block runs."""
    fields = dict(
        host="127.0.0.1",
        port=free_port(),
        zone_code="TESTZ",
        epics_backend="sim",
        sim_tick_seconds=0.2,
        render_interval=0.05,
        heartbeat_seconds=0.5,
        log_level="WARNING",
        # The built-in test account, and a fixed signing key so a cookie
        # minted in one test is still valid in the next.
        dev=True,
        session_secret="test-only-secret",
    )
    fields.update(overrides)
    settings = Settings(**fields)
    app = create_app(settings)
    config = serve_config(settings)
    config.accesslog = None
    stop = threading.Event()

    def run() -> None:
        from hypercorn.asyncio import serve

        async def shutdown() -> None:
            # Hypercorn shuts down when this coroutine returns. Waiting on a
            # threading.Event in an executor is how a fixture in another thread
            # gets to ask it to.
            await asyncio.get_running_loop().run_in_executor(None, stop.wait)

        asyncio.run(serve(app, config, shutdown_trigger=shutdown))

    thread = threading.Thread(target=run, daemon=True)
    thread.start()
    if not accepting(settings.port):  # pragma: no cover
        pytest.fail("server did not start")
    yield f"http://127.0.0.1:{settings.port}"
    stop.set()
    thread.join(timeout=10)


@pytest.fixture
async def anonymous(server):
    """A client that has not signed in."""
    import httpx

    async with httpx.AsyncClient(base_url=server, timeout=15) as client:
        yield client


@pytest.fixture
async def client(server):
    """A signed-in client — what every test below except TestAuthGate wants."""
    import httpx

    async with httpx.AsyncClient(base_url=server, timeout=15) as client:
        response = await client.post(
            "/login",
            data={"username": "test", "password": "test"},
            follow_redirects=False,
        )
        assert response.status_code == 303, "the built-in test account did not sign in"
        yield client


#: The desk the write tests write from. They are about what a write is held
#: to, not about who may make it — that is `TestExclusiveControl` — so this
#: desk takes control of the device it writes to first.
WRITER = "writer"


async def write(client, *, params, json=None, headers=None):
    """A write made from the desk that has control of the PV's device."""
    await client.post(
        "/api/lock", params={"pv": params["pv"], "action": "force"},
        json={"tab": WRITER}, headers=DATASTAR,
    )
    return await client.post(
        "/api/write", params=params, json={**(json or {}), "tab": WRITER},
        headers={**DATASTAR, **(headers or {})},
    )


async def read_events(
    client,
    path: str,
    count: int,
    timeout: float = 10.0,
    into: list[str] | None = None,
    headers: dict[str, str] | None = None,
) -> list[str]:
    """Collect `count` SSE events (blank-line separated) from a stream.

    `into` lets a caller keep what arrived when the read is cancelled rather
    than waiting for the full count — the tests that watch a stream while
    writing to a PV need exactly that.
    """
    events: list[str] = into if into is not None else []

    async def reader():
        async with client.stream("GET", path, headers=headers) as response:
            assert response.status_code == 200
            assert response.headers["content-type"].startswith("text/event-stream")
            buffer = ""
            async for chunk in response.aiter_text():
                buffer += chunk
                while "\n\n" in buffer:
                    event, buffer = buffer.split("\n\n", 1)
                    events.append(event)
                    if len(events) >= count:
                        return

    try:
        await asyncio.wait_for(reader(), timeout=timeout)
    except asyncio.TimeoutError:  # pragma: no cover - surfaced by the assertion
        pass
    return events


class TestPage:
    async def test_every_screen_in_the_zone_is_served(self, client):
        """The routes come from the zone's folders, so the menu cannot disagree
        with what the app serves."""
        for slug in ("l4-opcpa", "chillers", "vacuum", "cameras"):
            response = await client.get(f"/{slug}")
            assert response.status_code == 200, slug

    async def test_the_menu_is_the_same_on_every_screen(self, client):
        menus = []
        for slug in ("l4-opcpa", "chillers", "vacuum"):
            body = (await client.get(f"/{slug}")).text
            menus.append(re.findall(r'class="nav-link"[^>]*>([^<]+)', body))
        assert menus[0] == menus[1] == menus[2]
        assert menus[0] == ["L4 OPCPA", "Chillers", "Vacuum", "Cameras"]

    async def test_the_zone_is_named_on_every_screen(self, client):
        """Each zone is a separate network, so "which zone is this" must never
        be a guess."""
        body = (await client.get("/chillers")).text
        assert 'class="nav-zone"' in body
        assert ">TESTZ<" in body

    async def test_a_screen_the_zone_does_not_have_is_a_404(self, client):
        assert (await client.get("/telepathy")).status_code == 404

    async def test_a_yaml_only_screen_renders_live_values(self, client):
        """Nobody wrote Python for the Chillers screen: it is components from
        `components/` configured in YAML, and the simulator is seeded from what
        those components declare."""
        body = (await client.get("/chillers")).text
        assert "Chiller bank" in body
        assert 'class="data-grid"' in body
        # A real reading, not a placeholder, and the injected faults are there.
        assert body.count('data-tone="unknown"') <= 1
        assert "PV INV" in body

    async def test_renders_with_real_values_not_placeholders(self, client):
        """The prewarmed cache is what makes server-side rendering worth
        anything: a control-room page that renders `<>` and fills in after a
        round-trip reads as "the system is down" for the second it takes."""
        response = await client.get("/l4-opcpa")
        assert response.status_code == 200
        body = response.text
        assert "L4 OPCPA" in body
        assert 'id="NL2-overview"' in body
        # CONN is declared true, so it must already read YES in the HTML itself.
        assert ">YES<" in body
        assert body.count('data-tone="unknown"') <= 1

    async def test_declares_every_signal_its_markup_references(self, client):
        body = (await client.get("/l4-opcpa")).text
        declared = set(re.findall(r"&#34;([A-Za-z_][A-Za-z0-9_]*)&#34;:", body))
        referenced = set(re.findall(r"\$([A-Za-z_][A-Za-z0-9_]*)", body))
        assert referenced - declared == set()

    async def test_ships_exactly_one_script(self, client):
        # The reason this rewrite exists: no bundler, no hydration.
        body = (await client.get("/l4-opcpa")).text
        assert body.count("<script") == 1
        assert "datastar.js" in body

    async def test_a_camera_screen_also_ships_the_camera_script(self, client):
        """A camera tile is the one thing Datastar cannot draw: frames arrive
        as binary on a WebSocket. The script comes only with screens that have
        a camera; every other screen keeps exactly one (above)."""
        body = (await client.get("/cameras")).text
        assert body.count("<script") == 2
        assert re.search(r'<script type="module" src="/static/js/cameras\.js\?v=\w+"', body)
        assert body.count("data-camera=") >= 4

    async def test_index_redirects_to_the_zone_first_screen(self, client):
        response = await client.get("/", follow_redirects=False)
        assert response.status_code in (307, 308)
        assert response.headers["location"] == "/l4-opcpa"


class TestStream:
    async def test_opens_with_a_full_sync_then_patches(self, client):
        events = await read_events(client, "/l4-opcpa/stream", count=4)
        assert len(events) >= 4
        assert events[0].startswith("event: datastar-patch-signals")
        # The opening signals also carry this tab's view of the screen's
        # exclusive PVs (`_locks`), which the page could not know.
        assert '"_age":0' in events[0]
        assert events[1].startswith("event: datastar-patch-elements")
        # The opening sync carries every widget.
        assert 'id="NL2-overview"' in events[1]
        assert 'id="NL2-chiller-0-flow"' in events[1]

    async def test_later_patches_carry_only_what_changed(self, client):
        events = await read_events(client, "/l4-opcpa/stream", count=8)
        element_events = [e for e in events if "patch-elements" in e][1:]
        assert element_events, "expected incremental patches"
        # The drifting analogue readouts move; the shutter does not flap.
        patched = set()
        for event in element_events:
            patched.update(re.findall(r'id="(NL2-[^"]+)"', event))
        assert patched
        assert "NL2-shutter" not in patched

    async def test_heartbeat_resets_the_browser_watchdog(self, client):
        events = await read_events(client, "/l4-opcpa/stream", count=6)
        assert sum(1 for e in events if "patch-signals" in e) >= 2


class TestChoosingTheLasers:
    """A workstation shows the lasers its operator controls. A screen that
    says it is `selectable` offers each of its components as a checkbox in
    the header, beside its title and description."""

    @staticmethod
    def header(page: str) -> str:
        return page[page.index('<header class="page-header">') : page.index("</header>")]

    #: One tag, read attribute by attribute: a Datastar expression in a
    #: quoted attribute may hold a `>` (an arrow function), which is valid.
    TAG = r'(?:[^>"]|"[^"]*")*>'

    def boxes(self, header: str) -> list[str]:
        return re.findall(r'<input type="checkbox"' + self.TAG, header)

    @staticmethod
    def signals(page: str) -> dict:
        """What the page element declares."""
        return json.loads(
            html.unescape(re.search(r'<div class="page"\s+data-signals="([^"]*)"', page).group(1))
        )

    async def test_each_laser_is_offered_beside_the_title_ticked(self, client):
        header = self.header((await client.get("/l4-opcpa")).text)
        boxes = self.boxes(header)
        assert [re.search(r'value="([^"]+)"', box).group(1) for box in boxes] == ["NL2", "NL4"]
        assert all(" checked" in box for box in boxes), "a laser starts hidden"
        assert header.index('class="page-description"') < header.index(boxes[0])

    async def test_a_screen_that_is_not_selectable_offers_none(self, client):
        assert self.boxes(self.header((await client.get("/chillers")).text)) == []

    #: What Datastar sends with every request, and what tells the server the
    #: signals in it are Datastar's.
    DATASTAR = {"Datastar-Request": "true"}

    @staticmethod
    def stream(hidden: list[str]) -> str:
        """The screen's stream as Datastar opens it: the signals it sends go
        in one `datastar` query parameter."""
        return "/l4-opcpa/stream?datastar=" + quote(json.dumps({"hidden": hidden}))

    async def test_a_stream_opened_with_a_laser_hidden_carries_none_of_it(self, client):
        """Neither the catch-up it opens with nor any patch after it: a
        hidden laser costs the browser nothing."""
        everything = await read_events(client, self.stream([]), count=2, headers=self.DATASTAR)
        assert 'id="NL4-' in everything[1], "NL4 is not on this screen to hide"
        events = await read_events(client, self.stream(["NL4"]), count=8, headers=self.DATASTAR)
        elements = [event for event in events if "patch-elements" in event]
        assert len(elements) >= 2, "expected the catch-up and at least one patch"
        assert 'id="NL2-overview"' in elements[0], "the shown laser is missing"
        assert not any('id="NL4-' in event for event in elements)

    async def test_unticking_hides_the_laser_and_reopens_the_stream_without_it(self, client):
        """One signal says which lasers are hidden: it hides their columns,
        and it is what the stream is asked for when the page reopens it. The
        reopened stream has the same URL, which is what makes Datastar cancel
        the one it replaces."""
        page = (await client.get("/l4-opcpa")).text
        declared = self.signals(page)
        assert declared.get("hidden") == [], "the hidden lasers are not a signal the page sends"
        for key in ("NL2", "NL4"):
            column = re.search(rf'<div class="component-choice"[^>]*data-show="([^"]*)"[^>]*>\s*(?:<div class="view-host">)?\s*(?:<div class="view-slot" id="{key}-view"></div>)?\s*<article[^>]*>\s*<header class="panel-header">\s*<h2 class="panel-title">{key}<', page)
            assert column, f"{key}'s column is not shown by the signal"
            assert html.unescape(column.group(1)) == f"!$hidden.includes('{key}')"
        box = re.search(r'<input type="checkbox" value="NL4"' + self.TAG, self.header(page)).group(0)
        change = html.unescape(re.search(r'data-on:change="([^"]*)"', box).group(1))
        assert "$hidden" in change and "'NL4'" in change, change
        assert "hmi-choice" in change, "the box does not ask for the stream to reopen"
        opened = re.search(r'<div class="page"' + self.TAG, page).group(0)
        first = re.search(r"(@get\('/l4-opcpa/stream'[^\"]*)\"", opened).group(1)
        assert f'data-on:hmi-choice="{first}"' in opened, "not reopened the way it was opened"

    def column(self, page: str, key: str) -> str:
        """The opening tag of a laser's column."""
        return re.search(
            r'<div class="component-choice"' + self.TAG + rf'(?=(?:(?!component-choice).)*?<h2 class="panel-title">{key}<)',
            page,
            re.S,
        ).group(0)

    async def test_the_choice_outlasts_the_page(self, client):
        """Saved for this workstation as it is made, and painted on the next
        render: the hidden laser is hidden from the first frame, its box is
        unticked, and the stream the page opens is asked without it."""
        page = (await client.get("/l4-opcpa")).text
        box = re.search(r'<input type="checkbox" value="NL4"' + self.TAG, self.header(page)).group(0)
        change = html.unescape(re.search(r'data-on:change="([^"]*)"', box).group(1))
        # Which box changed, too: hiding or showing a laser moves its control.
        assert "@post('/api/hidden?screen=l4-opcpa&toggled=NL4&value=' + $hidden.join(','))" in change

        saved = await client.post(
            "/api/hidden", params={"screen": "l4-opcpa", "value": "NL4"}, json={}, headers=self.DATASTAR
        )
        assert saved.is_success, saved.status_code
        page = (await client.get("/l4-opcpa")).text
        declared = self.signals(page)
        assert declared["hidden"] == ["NL4"]
        boxes = {re.search(r'value="([^"]+)"', b).group(1): b for b in self.boxes(self.header(page))}
        assert " checked" in boxes["NL2"] and " checked" not in boxes["NL4"]
        assert 'style="display:none"' in self.column(page, "NL4"), "NL4 flashes up before it hides"
        assert 'style="display:none"' not in self.column(page, "NL2")

    async def test_a_laser_the_choice_does_not_name_is_shown(self, client):
        """What is saved is what was hidden, so a laser added to the screen
        after a workstation chose — NL2 here, as far as this cookie knows —
        is shown there; and a name the screen does not have is dropped."""
        client.cookies.set("hidden-l4-opcpa", "NL9,NL4")
        page = (await client.get("/l4-opcpa")).text
        declared = self.signals(page)
        assert declared["hidden"] == ["NL4"]
        assert 'style="display:none"' not in self.column(page, "NL2")

    async def test_unticking_closes_the_laser_s_open_view(self, client):
        """A Registers or ModBox view holds a stream of its own; a hidden
        laser's view would keep it open with nobody looking. Emptying the
        slot removes the view, which is what cancels its stream."""
        header = self.header((await client.get("/l4-opcpa")).text)

        def change(key: str) -> str:
            box = re.search(rf'<input type="checkbox" value="{key}"' + self.TAG, header).group(0)
            return html.unescape(re.search(r'data-on:change="([^"]*)"', box).group(1))

        assert "el.checked || document.getElementById('NL2-view')?.replaceChildren()" in change("NL2")
        assert "-view" not in change("NL4"), "NL4 has no views to close"

    async def test_a_stream_asked_to_hide_what_is_not_there_hides_nothing(self, client):
        events = await read_events(client, self.stream(["NL9"]), count=2, headers=self.DATASTAR)
        assert 'id="NL2-overview"' in events[1] and 'id="NL4-' in events[1]


class TestChoosingALaserMovesItsControl:
    """A laser a workstation hides is one its operator has stopped
    controlling, and one it shows is one they mean to control. So hiding it
    gives up this tab's exclusive control of it at once, and showing it takes
    control of whatever is free — never forcing it from another tab."""

    START = "CMD_NL2_START_LASER"
    STOP = "CMD_NL2_STOP_LASER"

    @pytest.fixture(autouse=True)
    async def nobody_holds_nl2(self, client):
        # The server is shared by the module: start and leave with NL2 free.
        for pv in (self.START, self.STOP):
            await lock(client, "janitor", "force", pv=pv)
            await lock(client, "janitor", "release", pv=pv)
        yield
        for pv in (self.START, self.STOP):
            await lock(client, "janitor", "force", pv=pv)
            await lock(client, "janitor", "release", pv=pv)

    @staticmethod
    async def toggle(client, tab: str, key: str, hidden: list[str]):
        """What the checkbox sends: the hidden set after the change, which
        box changed, and the tab's id among its signals."""
        return await client.post(
            "/api/hidden",
            params={"screen": "l4-opcpa", "value": ",".join(hidden), "toggled": key},
            json={"tab": tab},
            headers=DATASTAR,
        )

    async def test_hiding_a_laser_gives_up_its_control(self, client):
        for pv in (self.START, self.STOP):
            assert '"state":"mine"' in (await lock(client, "tab-a", "take", pv=pv)).text
        hidden = await self.toggle(client, "tab-a", "NL2", ["NL2"])
        assert '"state":"free"' in hidden.text, "the tab is not told it let go"
        for pv in (self.START, self.STOP):
            assert '"state":"mine"' in (await lock(client, "tab-b", "take", pv=pv)).text

    async def test_showing_a_laser_takes_control_of_it(self, client):
        shown = await self.toggle(client, "tab-a", "NL2", [])
        # One entry: the laser is taken whole.
        assert shown.text.count('"state":"mine"') == 1, shown.text
        assert "Refused" not in (await press(client, "tab-a", pv=self.START)).text
        assert "controlled by test" in (await lock(client, "tab-b", "take", pv=self.START)).text

    async def test_another_tab_s_control_is_neither_taken_nor_given_up(self, client):
        """If possible, and only then: a laser held elsewhere stays held there,
        whether this tab shows it or hides it."""
        await lock(client, "tab-b", "take", pv=self.START)
        shown = await self.toggle(client, "tab-a", "NL2", [])
        assert '"state":"other"' in shown.text, "taken from the tab that had it"
        await self.toggle(client, "tab-a", "NL2", ["NL2"])
        assert "Refused" not in (await press(client, "tab-b", pv=self.START)).text
        assert "Refused" in (await press(client, "tab-a", pv=self.START)).text


class TestALaserIsControlledWhole:
    """One desk has a laser or none does: its basic view and every register
    setpoint go together, so no desk can write a register of a laser another
    desk is running. Reading a register again is the laser's to share."""

    START = "CMD_NL2_START_LASER"
    REGISTER = "L4-OPCPA-NL2:PS1225:11:SetPoint:W"
    REFRESH = "L4-OPCPA-NL2:PS1225:11:SetPoint.PROC"

    @pytest.fixture(autouse=True)
    async def nobody_holds_nl2(self, client):
        await lock(client, "janitor", "force", pv=self.START)
        await lock(client, "janitor", "release", pv=self.START)
        yield
        await lock(client, "janitor", "force", pv=self.START)
        await lock(client, "janitor", "release", pv=self.START)

    async def test_a_register_is_written_only_by_the_desk_that_has_the_laser(self, client):
        await lock(client, "tab-a", "take", pv=self.START)
        refused = (await press(client, "tab-b", pv=self.REGISTER, value=20)).text
        assert "controlled by test" in refused, refused
        assert "Refused" not in (await press(client, "tab-a", pv=self.REGISTER, value=20)).text

    async def test_the_strip_takes_the_laser_by_its_unit(self, client):
        """What the strip posts: the unit, not one of its PVs."""
        taken = await client.post(
            "/api/lock",
            params={"unit": "l4-opcpa/NL2", "action": "take"},
            json={"tab": "tab-a"},
            headers=DATASTAR,
        )
        assert '"state":"mine"' in taken.text and "NL2: you have control" in taken.text, taken.text
        assert "Refused" not in (await press(client, "tab-a", pv=self.REGISTER, value=20)).text

    async def test_any_desk_may_read_a_register_again(self, client):
        await lock(client, "tab-a", "take", pv=self.START)
        assert "Refused" not in (await press(client, "tab-b", pv=self.REFRESH, value=1)).text


class TestTheFirstTabToOpenAScreenHasControl:
    """Whoever opens a screen first is the operator: every exclusive control
    on it that nobody holds is theirs the moment their stream opens."""

    START = "CMD_NL2_START_LASER"
    STOP = "CMD_NL2_STOP_LASER"

    @pytest.fixture(autouse=True)
    async def nobody_holds_nl2(self, client):
        for pv in (self.START, self.STOP):
            await lock(client, "janitor", "force", pv=pv)
            await lock(client, "janitor", "release", pv=pv)
        yield
        for pv in (self.START, self.STOP):
            await lock(client, "janitor", "force", pv=pv)
            await lock(client, "janitor", "release", pv=pv)

    @staticmethod
    async def open_screen(client, tab: str, hidden: list[str] | None = None) -> None:
        signals = {"tab": tab, **({"hidden": hidden} if hidden is not None else {})}
        path = "/l4-opcpa/stream?" + urlencode({"datastar": json.dumps(signals)})
        await read_events(client, path, count=1, headers=DATASTAR)

    async def test_the_first_tab_may_start_the_laser_without_taking_control(self, client):
        await self.open_screen(client, "tab-a")
        assert "Refused" not in (await press(client, "tab-a", pv=self.START)).text
        await self.open_screen(client, "tab-b")
        refused = (await press(client, "tab-b", pv=self.START)).text
        # Named the way a lock taken by hand is: who, from where, on what.
        assert "controlled by test at 127.0.0.1" in refused, refused
        assert "l4-opcpa" in refused, refused

    async def test_a_hidden_laser_is_not_taken(self, client):
        await self.open_screen(client, "tab-a", hidden=["NL2"])
        assert "take control first" in (await press(client, "tab-a", pv=self.START)).text


class TestTheLaserChoiceIsSaved:
    """The save behind the checkboxes: one cookie per screen, holding only
    names that are that screen's components, and a line in the log saying
    who chose — as the palette does."""

    @pytest.fixture
    async def signed_in(self):
        app = create_app(
            Settings(
                zone_code="TESTZ",
                epics_backend="sim",
                sim_tick_seconds=10,
                log_level="WARNING",
                dev=True,
                session_secret="test-only-secret",
            )
        )
        async with app.test_app() as running:
            client = running.test_client()
            await client.post("/login", form={"username": "test", "password": "test"})
            yield client

    @staticmethod
    async def save(client, screen: str, value: str):
        return await client.post(
            "/api/hidden",
            query_string={"screen": screen, "value": value},
            json={},
            headers={"Datastar-Request": "true"},
        )

    async def test_it_says_who_chose_and_keeps_only_the_screen_s_lasers(self, signed_in, caplog):
        with caplog.at_level(logging.INFO, logger="core.routes"):
            response = await self.save(signed_in, "l4-opcpa", "NL4,NL9,<script>")
        assert "user=test" in caplog.text and "/l4-opcpa" in caplog.text, caplog.text
        assert "hidden-l4-opcpa=NL4;" in response.headers.get("set-cookie", "")

    async def test_a_screen_without_the_choice_is_refused(self, signed_in):
        response = await self.save(signed_in, "chillers", "chiller-bank")
        assert response.status_code == 404
        assert "hidden-" not in response.headers.get("set-cookie", "")


class TestWrite:
    async def test_a_direct_write_reaches_the_pv_and_the_page(self, client):
        shutter = "L4-OPCPA-NL2:IO:15:RC1_pin31"
        events: list[str] = []

        async def watch():
            await read_events(client, "/l4-opcpa/stream", count=30, timeout=6, into=events)

        task = asyncio.create_task(watch())
        await asyncio.sleep(0.6)
        response = await write(client, params={"pv": shutter, "value": "1"}, json={})
        assert response.status_code == 200
        assert "_toast" in response.text
        await asyncio.sleep(1.0)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        assert any("is OPEN" in event for event in events), "shutter never repainted"

    async def test_a_command_runs_its_effect_chain(self, client):
        """A command PV is a trigger, not a value: one press, many writes. The
        Sequencer row is the only place that is visible."""
        events: list[str] = []

        async def watch():
            await read_events(client, "/l4-opcpa/stream", count=60, timeout=8, into=events)

        task = asyncio.create_task(watch())
        await asyncio.sleep(0.6)
        # NL2 is under control, so the tab takes it first — whoever had it.
        start = "CMD_NL2_START_LASER"
        await lock(client, "tab-a", "force", pv=start)
        try:
            assert "Refused" not in (await press(client, "tab-a", pv=start)).text
            await asyncio.sleep(1.5)
        finally:
            # The server is shared by the module: leave the command free.
            await lock(client, "tab-a", "release", pv=start)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        assert any("RUNNING" in event for event in events)

    async def test_an_operator_supplied_value_comes_from_its_signal(self, client):
        # `Datastar-Request` is how the SDK knows a body carries signals; the
        # real client always sends it.
        response = await write(client, params={"pv": "L4-OPCPA-NL2:PS5059:22:SetBothChannelsTrigDelay", "signal": "NL2_delay_value"},
            json={"NL2_delay_value": "500"},
            headers={"Datastar-Request": "true"},
        )
        assert response.status_code == 200
        assert "500" in response.text

    async def test_an_empty_field_is_refused_rather_than_written(self, client):
        response = await write(client, params={"pv": "L4-OPCPA-NL2:ATT", "signal": "NL2_atten_value"},
            json={"NL2_atten_value": ""},
            headers={"Datastar-Request": "true"},
        )
        assert "enter a value first" in response.text


class TestOps:
    async def test_health_and_stats(self, client):
        assert (await client.get("/health/live")).text == "live"
        assert (await client.get("/health/ready")).json()["status"] == "ready"
        stats = (await client.get("/stats")).json()
        assert stats["zone"] == "TESTZ"
        # How the zone was chosen is the second question after "is anything
        # monitored", so /stats answers both.
        assert stats["zone_resolved_by"] == "ZONE_CODE"
        assert set(stats["screens"]) == {"l4-opcpa", "chillers", "vacuum", "cameras"}
        assert stats["monitored_pvs"] > 0
        assert stats["link_ok"] is True


class TestWriteGuards:
    DELAY = "L4-OPCPA-NL2:PS5059:22:SetBothChannelsTrigDelay"

    async def _set(self, client, pv: str, text: str):
        return await write(client, params={"pv": pv, "signal": "v"},
            json={"v": text},
            headers={"Datastar-Request": "true"},
        )

    async def test_a_value_outside_the_devices_range_is_refused(self, client):
        """The limits are the component's, not the field's: a value that reaches
        this endpoint by any route is checked, because the field that usually
        stops it is a convenience the browser can be talked out of."""
        response = await self._set(client, self.DELAY, "60001")
        assert "60000" in response.text, "the refusal does not say what the range is"
        assert "Refused" in response.text

    async def test_a_value_inside_the_range_is_written(self, client):
        """The guard has to let the machine be operated."""
        response = await self._set(client, self.DELAY, "500")
        assert "Refused" not in response.text
        assert "500" in response.text

    async def test_the_field_refuses_it_before_the_operator_presses(self, client):
        """The endpoint is the guarantee; this is the courtesy. An operator
        should see that 60001 is not acceptable, not press Confirm and be told."""
        page = (await client.get("/l4-opcpa")).text
        confirm = confirm_for(page, "NL2-set-trigger-delay-status")
        assert "60000" in confirm and "10" in confirm

    async def test_a_fraction_of_a_nanosecond_is_refused(self, client):
        """The delay is an integer. Not truncated to 500 — that sends a value
        nobody typed — but refused, and the field would not have let the
        decimal point be typed in the first place."""
        response = await self._set(client, self.DELAY, "500.7")
        assert "Refused" in response.text and "whole number" in response.text

    async def test_a_request_with_no_value_at_all_is_refused(self, client):
        # Falling through used to write the string "None" to the device.
        response = await write(client, params={"pv": "L4-OPCPA-NL2:ATT"}, json={})
        assert "Refused" in response.text
        assert "None" not in response.text

    async def test_nan_and_infinity_are_not_values_an_operator_typed(self, client):
        for text in ("nan", "infinity", "1_000"):
            response = await write(client, params={"pv": "L4-OPCPA-NL2:SI_TEST", "value": text}, json={}
            )
            # Written as the string it is, never silently turned into a number.
            # (The arrow is escaped in the JSON payload, so match on the tail.)
            assert f"{text}" in response.text
            assert "Refused" not in response.text


class TestModboxActionLayout:
    """The Modbox panel offers the same four things in the same shape as the
    React one: two one-press buttons, then two actions that need a value and
    stay folded away until chosen."""

    @staticmethod
    def panel(page: str) -> str:
        start = page.index('aria-label="Modbox actions"')
        return page[start : page.index("</section>", start)]

    async def test_an_action_needing_a_value_is_folded_away(self, client):
        """A field sitting open in the panel reads as something to fill in;
        behind its own button it reads as one of the things you can do."""
        panel = self.panel((await client.get("/l4-opcpa")).text)
        toggle = panel[panel.index("Set Waveform to") - 300 :]
        assert "disclosure-toggle" in toggle[:400]

    async def test_confirm_sits_beneath_the_waveform_list(self, client):
        """Side by side, the select was squeezed to a few characters — the
        names it holds are what the operator is choosing between."""
        css = (await client.get("/static/css/hmi.css")).text
        # The shared rule, at the start of a line — not one scoped to another
        # panel (`.register-write-inner .waveform-select`), which has the
        # width this one lacks and lays it out differently.
        rule = re.search(r"^\.waveform-select \{([^}]*)\}", css, re.M)
        assert rule and "column" in rule.group(1)


class TestWaveformSelect:
    """Nothing selected is not a value. The control must not offer to send it."""

    @staticmethod
    def control(page: str) -> str:
        start = page.index('class="waveform-select"')
        return page[start : page.index("</span>", page.index("Confirm", start))]

    async def test_confirm_is_dead_until_a_waveform_is_chosen(self, client):
        control = self.control((await client.get("/l4-opcpa")).text)
        assert "disabled:" in control, "Confirm offers to send nothing at all"

    async def test_the_prompt_is_not_one_of_the_choices(self, client):
        """It names what the control is for; it is not a waveform anyone can
        load, so it does not belong in the list of waveforms."""
        control = self.control((await client.get("/l4-opcpa")).text)
        prompt = control[control.index("<option value=\"\"") :][:120]
        assert "hidden" in prompt and "disabled" in prompt

    async def test_the_prompt_reads_the_same_as_the_react_panel(self, client):
        control = self.control((await client.get("/l4-opcpa")).text)
        assert "Select Waveform" in control

    async def test_the_panel_closes_only_once_the_write_lands(self, client):
        """This control kept closing itself on the press, so a refusal was
        patched into a panel that had just been hidden."""
        control = self.control((await client.get("/l4-opcpa")).text)
        assert "close=" in control
        assert "= false" not in control.split("@post")[1][:200]


class TestTruncationIsVisible:
    """The server drops digits the device cannot resolve. The field has to
    agree with it, or the operator reads 2.55 and the amplifier gets 2.5 —
    which is the one thing truncation must not cost.
    """

    def test_a_field_with_decimals_says_what_will_be_sent(self):
        """A current resolved to tenths (the YDFA's), so 2.55 is sent as 2.5 —
        and the field rewrites itself to 2.5 on leaving it, before the press.
        Rendered directly: no TESTZ laser exposes a field with decimals to
        drop now that the trigger delay is an integer."""
        from types import SimpleNamespace

        from core.jinja import create_environment

        markup = create_environment().from_string(
            '{% import "controls.html" as controls with context %}'
            '{{ controls.preset_input("YDFA current", [], "X:YDFA", "set_ydfa", precision=1) }}'
        ).render(comp=SimpleNamespace(key="NL2"), lock_key=lambda pv: None)
        field = input_tag(markup, 'aria-label="YDFA current"')
        assert "data-on:blur" in field
        assert "{0,1}" in field

    async def test_the_trigger_delay_is_typed_in_whole_nanoseconds(self, client):
        """An integer, so there is nothing to truncate: the decimal point
        cannot be typed, the keypad does not offer one, and Confirm stays dead
        for anything that is not a whole number."""
        page = (await client.get("/l4-opcpa")).text
        field = input_tag(page, 'aria-label="Set Trigger Delay custom value"')
        assert 'inputmode="numeric"' in field, field
        typeable = TestAFieldTakesOnlyWhatItsKindAllows.accepts(field)
        assert not typeable("500.") and not typeable("5e"), "a decimal or exponent can be typed"
        assert "data-on:blur" not in field, "a field with no decimals rewrites itself"
        confirm = confirm_for(page, "NL2-set-trigger-delay-status")
        assert "[0-9]" in confirm and "isNaN" not in confirm

    async def test_a_field_with_no_precision_is_left_alone(self, client):
        """Nothing to reconcile where every typed digit is sent."""
        page = (await client.get("/l4-opcpa")).text
        field = page[page.index('aria-label="Set Attenuator"') - 700 :][:700]
        assert "data-on:blur" not in field


class TestExponentialInput:
    """`<input type="number">` accepts "1e3", and while the exponent is
    half-typed the browser reports the field as empty — so typing `e` after a
    value wipes it on screen. Nothing on this panel is set in scientific
    notation, so the field does not accept one unless a setpoint says it may.
    """

    DELAY = "L4-OPCPA-NL2:PS5059:22:SetBothChannelsTrigDelay"

    async def _write(self, client, text: str):
        return await write(client, params={"pv": self.DELAY, "signal": "v", "status": "s"},
            json={"v": text},
            headers={"Datastar-Request": "true"},
        )

    async def test_an_exponential_is_refused(self, client):
        response = await self._write(client, "1e3")
        assert "Refused" in response.text

    async def test_the_same_number_written_plainly_is_accepted(self, client):
        """The guard is about notation, not about the value."""
        response = await self._write(client, "1000")
        assert "Refused" not in response.text

    async def test_the_field_will_not_accept_the_key(self, client):
        """Refusing the write is not enough: the browser blanks the field as
        soon as `e` is typed, so the digits vanish before anything is sent."""
        page = (await client.get("/l4-opcpa")).text
        assert "preventDefault" in page, "nothing stops `e` reaching the field"


class TestTypography:
    """The panel is laid out in rem against a condensed face.

    Without the font the browser falls back to whatever narrow sans it has,
    every string measures differently, and the fixed label column that the
    whole grid hangs off starts truncating. The React app ships it; so does
    this one, or the two do not look alike at any size.
    """

    FACES = ("RobotoCondensed-Regular.ttf", "RobotoCondensed-Bold.ttf")

    async def test_the_font_is_declared(self, client):
        page = (await client.get("/l4-opcpa")).text
        css = (await client.get("/static/css/hmi.css")).text
        assert "@font-face" in css
        assert "Roboto Condensed" in css
        for face in self.FACES:
            assert face in css, f"{face} is never declared"
        assert "preload" in page, "the face is fetched only after the first paint"

    async def test_the_font_is_actually_served(self, client):
        """A declaration pointing at a 404 is worse than none: the browser
        waits for it before painting the text it applies to."""
        for face in self.FACES:
            response = await client.get(f"/static/fonts/{face}")
            assert response.status_code == 200, f"{face} is declared but not shipped"
            assert len(response.content) > 10_000


class TestStaticVersions:
    """Static files are cached for twelve hours. A stylesheet or script URL
    that carries a hash of the file is fetched again the moment the file
    changes; without it, a station shows yesterday's stylesheet over today's
    markup for the rest of the day."""

    async def test_the_stylesheet_and_script_urls_carry_the_files_hash(self, client, anonymous):
        from core.jinja import STATIC_ROOT

        def digest(path: str) -> str:
            return hashlib.sha256((STATIC_ROOT / path).read_bytes()).hexdigest()[:12]

        pages = [(await client.get(page)).text for page in ("/chillers", "/monitor")]
        pages.append((await anonymous.get("/login")).text)
        for body in pages:
            assert f'href="/static/css/hmi.css?v={digest("css/hmi.css")}"' in body
        assert f'src="/static/vendor/datastar.js?v={digest("vendor/datastar.js")}"' in pages[0]
        served = await client.get(f"/static/css/hmi.css?v={digest('css/hmi.css')}")
        assert served.status_code == 200

    async def test_a_font_keeps_the_url_the_stylesheet_asks_for(self, client):
        """The preload has to name exactly what `@font-face` fetches, or the
        browser downloads the face twice."""
        body = (await client.get("/chillers")).text
        assert 'href="/static/fonts/RobotoCondensed-Regular.ttf"' in body

    def test_the_version_follows_the_content(self, tmp_path):
        from core.jinja import static_url

        (tmp_path / "app.css").write_text("body { color: black }")
        before = static_url("/app.css", root=tmp_path)
        (tmp_path / "app.css").write_text("body { color: white }")
        after = static_url("/app.css", root=tmp_path)
        assert before.startswith("/static/app.css?v=") and before != after

    def test_a_same_size_edit_within_one_clock_tick_still_changes_the_version(self, tmp_path):
        """Linux stamps file times from a coarse clock that ticks every few
        milliseconds, so two quick edits can share an mtime. With the same
        size too, stat cannot tell them apart. Simulated here by pinning the
        mtime, so the test fails the same way on any filesystem."""
        import os
        import time

        from core.jinja import static_url

        file = tmp_path / "app.css"
        tick = time.time_ns()
        file.write_text("body { color: black }")
        os.utime(file, ns=(tick, tick))
        before = static_url("/app.css", root=tmp_path)
        file.write_text("body { color: white }")
        os.utime(file, ns=(tick, tick))
        after = static_url("/app.css", root=tmp_path)
        assert before != after


class TestCogPanels:
    async def test_a_cog_panel_closes_on_a_click_outside_it(self, client):
        """An operator who opens a cog, decides against it and clicks away
        should not have to find the cog again to put it back. React closes on
        an outside click; so does this."""
        page = (await client.get("/l4-opcpa")).text
        cog = page[page.index('aria-label="Modbox actions"') :][:900]
        assert "click__window" in cog, "nothing closes the panel from outside"
        assert "cog-wrapper" in cog, "the handler cannot tell inside from outside"


class TestModboxActions:
    async def test_the_actions_panel_offers_the_waveform_too(self, client):
        """React lists it among the Modbox actions as well as on the Waveform
        Preset row: loading a waveform is part of setting the Modbox up, and an
        operator working through that panel should not have to find the row."""
        page = (await client.get("/l4-opcpa")).text
        actions = page[page.index('aria-label="Modbox actions"') :]
        actions = actions[: actions.index("</section>")]
        assert "Set Waveform to" in actions


class TestPalette:
    """An operator who puts goggles on mid-shift has to be able to say so.

    The React panel keeps the choice in localStorage; this app renders on the
    server, so the choice is a cookie it can read while rendering. PALETTE
    stays the station default for a room that is always in goggles.
    """

    async def test_the_header_offers_the_palettes(self, client):
        page = (await client.get("/l4-opcpa")).text
        assert "Color palette" in page
        assert "No goggles" in page and "L4 goggles" in page

    async def test_choosing_one_sticks_for_the_next_page(self, client):
        chosen = await client.post("/api/palette", params={"value": "l4-goggles"}, json={})
        assert chosen.is_success

        page = (await client.get("/l4-opcpa")).text
        assert 'data-palette="l4-goggles"' in page

        await client.post("/api/palette", params={"value": "default"}, json={})
        page = (await client.get("/l4-opcpa")).text
        # The rendered attribute, not the binding that keeps it in step.
        assert 'data-palette="' not in page, "the default palette is the absence of one"

    async def test_choosing_one_does_not_reload_the_screen(self, client):
        """A reload would collapse every expanded list — MSS, module errors,
        the Modbox state, the flashlamp tally — because each is a signal that
        starts closed. The palette is one attribute on `<html>`, so it changes
        in place and whatever an operator had open stays open.
        """
        answer = await client.post(
            "/api/palette", params={"value": "l4-goggles"}, json={}
        )
        assert answer.is_success
        body = answer.text
        assert "datastar-redirect" not in body and "location" not in body.lower(), (
            f"the palette reloads the page: {body!r}"
        )

    async def test_the_document_follows_the_chosen_palette_without_a_reload(
        self, client
    ):
        page = (await client.get("/l4-opcpa")).text
        html_tag = page[page.index("<html") : page.index(">", page.index("<html")) + 1]
        assert "data-attr" in html_tag, (
            f"nothing binds the palette to the document: {html_tag!r}"
        )
        # Declared on the element that uses it: the page's own `data-signals`
        # sits inside `<body>`, which this element is processed before.
        assert "_palette" in html_tag and "data-signals" in html_tag, (
            f"the binding reads a signal nothing has declared yet: {html_tag!r}"
        )

    async def test_a_palette_nobody_defined_is_ignored(self, client):
        """A hand-edited cookie must not put an unknown value on <html>, where
        it would silently paint nothing."""
        await client.post("/api/palette", params={"value": "l9-goggles"}, json={})
        page = (await client.get("/l4-opcpa")).text
        assert "l9-goggles" not in page


class TestTheWaveformCatalogReachesBothControls:
    """Two controls offer the waveform list: the preset selector on its row,
    and `Set Waveform to…` inside Modbox Actions. The catalog is one list and
    both must show the same one — a device reconfigured mid-shift that only
    half the screen knows about is worse than one neither knows about.
    """

    async def test_both_selectors_are_patchable(self, client):
        page = (await client.get("/l4-opcpa")).text
        assert page.count("data-waveforms=") == 2, (
            "a selector the refresh cannot find will show a stale catalog for "
            "as long as the page is open"
        )

    async def test_both_cogs_re_read_the_catalog_when_opened(self, client):
        page = (await client.get("/l4-opcpa")).text
        assert page.count("@get('/api/waveforms?component=") == 2

    async def test_the_refresh_targets_every_copy(self, client):
        import re

        page = (await client.get("/l4-opcpa")).text
        key = re.search(r"/api/waveforms\?component=([^']+)'", page).group(1)
        body = (
            await client.get("/api/waveforms", params={"component": key})
        ).text
        assert "data-waveforms" in body, (
            f"patched by id, so only the first control is refreshed: {body!r}"
        )


class TestTheWaveformConfirmButtons:
    """Both controls refuse to send what the device does not offer."""

    async def test_both_buttons_watch_the_catalog_and_the_selection(self, client):
        page = (await client.get("/l4-opcpa")).text
        # Held, too, until the tab has the laser: the catalog is one reason.
        live = len(re.findall(r'data-attr="\{disabled:[^"]*waveforms_available[^"]*"', page))
        assert live == 2, (
            f"{live} of the two Confirm buttons go dead on an empty catalog"
        )

    async def test_a_refresh_carries_whether_anything_can_be_sent(self, client):
        import re

        page = (await client.get("/l4-opcpa")).text
        key = re.search(r"/api/waveforms\?component=([^']+)'", page).group(1)
        body = (await client.get("/api/waveforms", params={"component": key})).text
        assert "waveforms_available" in body, (
            "a catalog that empties while the page is open would leave the "
            f"buttons live: {body!r}"
        )


class TestTheRegisterTree:
    """Full control of a laser is its modules and every register under them.
    It is no wider than the laser it belongs to, so it takes the laser's own
    place on the screen rather than a page of its own — and it still holds
    its own stream, so the screen never carries hundreds of register rows
    nobody has opened.
    """

    async def test_a_laser_has_a_register_view(self, client):
        answer = await client.get("/l4-opcpa/NL2/registers")
        assert answer.status_code == 200
        view = answer.text
        assert "PS1225:11" in view, "the module is not in the tree"
        assert "Outlet temp" in view, "its registers are not"


class TestAModboxHasAViewOfItsOwn:
    """A laser with a ModBox can open a view of the ModBox's registers the
    way it opens its register tree: in the panel's place, from the panel's
    header, and left by its own Back. A laser without one offers nothing."""

    VIEW = "/l4-opcpa/NL2/modbox"

    async def test_a_laser_with_a_modbox_offers_it(self, client):
        page = (await client.get("/l4-opcpa")).text
        assert f"@get('{self.VIEW}')" in page, "no way to the ModBox view"

    async def test_a_laser_without_one_does_not(self, client):
        page = (await client.get("/l4-opcpa")).text
        assert "/l4-opcpa/NL4/modbox" not in page, "NL4 has no ModBox to show"

    async def test_both_ways_down_are_in_the_panel_header(self, client):
        page = (await client.get("/l4-opcpa")).text
        start = page.index('<h2 class="panel-title">NL2</h2>')
        header = page[start : page.index("</header>", start)]
        assert "@get('/l4-opcpa/NL2/registers')" in header
        assert f"@get('{self.VIEW}')" in header

    async def test_it_takes_the_panel_s_place_as_the_tree_does(self, client):
        """One slot per laser, whichever view fills it: two views of one
        laser cannot be open side by side in its one column."""
        modbox = await client.get(self.VIEW)
        tree = await client.get("/l4-opcpa/NL2/registers")
        assert modbox.status_code == 200
        assert modbox.headers.get("datastar-selector") == "#NL2-view"
        assert tree.headers.get("datastar-selector") == "#NL2-view"
        assert modbox.headers.get("datastar-mode") == "inner"
        page = (await client.get("/l4-opcpa")).text
        assert page.count('id="NL2-view"') == 1

    async def test_it_holds_its_own_stream_and_its_own_way_back(self, client):
        view = (await client.get(self.VIEW)).text
        assert f"@get('{self.VIEW}/stream', {{requestCancellation: 'cleanup'}})" in view
        back = re.search(r"<button[^>]*view-back[^>]*>", view)
        assert back and "el.closest('.view-slot').replaceChildren()" in back.group(0)
        assert "NL2 ModBox" in view, "the view does not say what it is"

    async def test_it_is_not_in_the_menu(self, client):
        page = (await client.get("/l4-opcpa")).text
        menu = page[page.index('class="nav"') : page.index("</nav>")]
        assert "modbox" not in menu.lower()


class TestTheModboxSections:
    """A ModBox's registers are grouped the way the device is built, and every
    ModBox is built the same way: sections fixed by the component, each
    opening like one of the laser's modules."""

    VIEW = "/l4-opcpa/NL2/modbox"
    SECTIONS = [
        "Identification",
        "AWG &amp; YDFA",
        "MBC1",
        "MBC2",
        "RF &amp; LAS1 &amp; AOM",
        "Delaygen",
    ]

    async def test_it_lists_them_in_order(self, client):
        view = (await client.get(self.VIEW)).text
        heads = re.findall(
            r'<button[^>]*class="module-head".*?<span class="module-label">(.*?)</span>',
            view,
            re.S,
        )
        assert heads == self.SECTIONS

    async def test_each_opens_on_its_own_and_starts_shut(self, client):
        """A signal per section, declared shut, so the view arrives as its
        headers alone; each header opens its own list and says so."""
        view = (await client.get(self.VIEW)).text
        declared = json.loads(
            html.unescape(re.search(r'data-signals="([^"]*)"', view).group(1))
        )
        modules = re.findall(r'<div class="module">(.*?)</div>\s*</div>', view, re.S)
        assert len(modules) == len(self.SECTIONS)
        toggled = []
        for module in modules:
            head = re.search(r'<button[^>]*class="module-head"[^>]*>', module, re.S).group(0)
            signal = re.search(r"\$(\w+) = !\$\1", head).group(1)
            assert declared.get(signal) is False, f"{signal} is not declared shut"
            assert f"'aria-expanded': ${signal} ? 'true' : 'false'" in head
            listing = re.search(r'<div class="register-list"[^>]*>', module).group(0)
            assert f'data-show="${signal}"' in listing
            assert 'style="display:none"' in listing, "a section paints open"
            toggled.append(signal)
        assert len(set(toggled)) == len(self.SECTIONS), "two sections open together"

    async def test_it_only_reads(self, client):
        """No SET and no refresh: the ModBox's registers are watched, not
        driven from here."""
        view = (await client.get(self.VIEW)).text
        assert 'class="register-select"' not in view, "a ModBox register offers SET"
        assert 'class="register-refresh"' not in view, "a ModBox register offers refresh"

    async def test_awg_and_ydfa_hold_their_seven_registers(self, client):
        view = (await client.get(self.VIEW)).text
        start = view.index('<span class="module-label">AWG &amp; YDFA</span>')
        section = view[start : view.index('class="module-head"', start + 1)]
        read = re.findall(r'title="L4-OPCPA-NL2:ModBox:([^"\n]+)', section)
        assert read == [
            "AWG:State",
            "AWG:Waveform",
            "AWG:PulseWidth",
            "AWG:PulseAmplitude",
            "YDFA:Current",
            "YDFA:State",
            "YDFA:SoftwareKey",
        ]

    async def test_a_register_is_read_under_the_laser_s_prefix(self, client):
        """`$(P):ModBox:<suffix>`: the suffix is the component's, the
        prefix is the laser's `$(P)`."""
        view = (await client.get(self.VIEW)).text
        start = view.index('<span class="module-label">AWG &amp; YDFA</span>')
        section = view[start : view.index('class="module-head"', start + 1)]
        assert 'title="L4-OPCPA-NL2:ModBox:AWG:State' in section, section[:600]


class TestAnOpenModuleLooksLikeAnyOpenList:
    """A module opens the way the laser's own lists do, so it says it is open
    the same way: the thick box round what was pressed, and its corner
    triangle darkened."""

    async def test_it_draws_the_box_an_open_list_draws(self, client):
        """In the same rule, so the two cannot drift apart."""
        css = (await client.get("/static/css/hmi.css")).text
        rule = re.search(
            r"([^{}]*\.state-button\[aria-expanded='true'\] \.state-pill[^{}]*)\{([^}]*)\}", css
        )
        assert rule and "outline" in rule.group(2), "no box round an open list"
        assert ".module-head[aria-expanded='true']" in rule.group(1), (
            "a module shows it is open some other way"
        )

    async def test_the_box_clears_the_first_register(self, client):
        """The box is drawn outside the header, and the rows follow it a row
        gap below — less than the box reaches. The list starts the box's
        reach further down, from the same two numbers the box is drawn with,
        so the box sits a row gap above the first register at any size."""
        css = (await client.get("/static/css/hmi.css")).text
        rule = re.search(r"\.module-head\[aria-expanded='true'\]\s*\{([^}]*)\}", css)
        assert rule, "no rule for an open module"
        assert "outline: var(--hmi-open-outline) solid" in rule.group(1), rule.group(1)
        assert "outline-offset: var(--hmi-open-offset)" in rule.group(1), rule.group(1)
        listing = re.search(r"(?m)^\.register-list\s*\{([^}]*)\}", css)
        assert listing and (
            "padding-top: calc(var(--hmi-open-outline) + var(--hmi-open-offset))"
            in listing.group(1)
        ), "the first register sits under the box"

    async def test_a_click_does_not_take_the_box_away(self, client):
        """Pressing the header focuses it, and the rule that hides the focus
        ring from a mouse used to tie with this one and come later — so the
        box appeared only once focus moved somewhere else. That rule is there
        to quiet the browser's ring, not to cancel an outline drawn on
        purpose, so it carries no weight of its own."""
        css = (await client.get("/static/css/hmi.css")).text
        assert re.search(r"(?m)^:where\(:focus:not\(:focus-visible\)\)\s*\{\s*outline: none;", css), (
            "hiding the focus ring from a mouse also hides an open module's box"
        )
        assert not re.search(r"(?m)^:focus:not\(:focus-visible\)", css)

    async def test_its_triangle_darkens_the_way_a_list_s_does(self, client):
        view = (await client.get("/l4-opcpa/NL2/registers")).text
        triangles = re.findall(r'<span class="corner-triangle"[^>]*>', view)
        assert triangles, "a module has no triangle"
        for triangle in triangles:
            assert re.search(r'data-class="\{expanded: \$NL2_registers_module_\d+\}"', triangle), (
                triangle
            )


class TestAllModulesShareOneBox:
    """The modules are one device's, so they sit in one card: one label
    column and one right edge for every register of the device, whichever
    module it is in."""

    async def test_the_tree_is_one_card(self, client):
        view = (await client.get("/l4-opcpa/NL2/registers")).text
        assert view.count('class="card"') == 1, "a card per module"
        card = view.index('class="card"')
        heads = [m.start() for m in re.finditer('class="module-head"', view)]
        assert len(heads) > 1, "the test zone needs more than one module for this"
        assert all(head > card for head in heads)

    async def test_a_header_and_its_list_are_a_row_gap_apart(self, client):
        """As they were as children of a card: the list's own padding is the
        box's reach, and the row gap is on top of it."""
        css = (await client.get("/static/css/hmi.css")).text
        rule = re.search(r"(?m)^\.module\s*\{([^}]*)\}", css)
        assert rule, "a module lays out its header and list with no gap"
        assert "flex-direction: column" in rule.group(1)
        assert "gap: var(--hmi-gap-sm)" in rule.group(1)

    async def test_an_open_module_s_box_clears_the_one_above(self, client):
        """Its box reaches above its header further than the row gap, into
        the module before it; the space between modules is that reach."""
        css = (await client.get("/static/css/hmi.css")).text
        rule = re.search(r"(?m)^\.module \+ \.module\s*\{([^}]*)\}", css)
        assert rule and (
            "margin-top: calc(var(--hmi-open-outline) + var(--hmi-open-offset))"
            in rule.group(1)
        ), "an open module's box overlaps the module above it"


class TestEveryRegisterCanBeReadAgain:
    """Some registers are processed rarely, so a reading can be minutes old.
    Each row has a refresh button: it processes the register's record — 1
    written to its `.PROC` — and the monitor brings the fresh reading. A
    setpoint's readback is a register like any other, so it has one too."""

    VIEW = "/l4-opcpa/NL2/registers"
    READING = ("L4-OPCPA-NL2:PS1225:11:T_out", "Outlet temp")
    SETPOINT = ("L4-OPCPA-NL2:PS1225:11:SetPoint", "Setpoint")

    @staticmethod
    def refresh(view: str, label: str) -> str:
        found = re.search(rf'<button[^>]*aria-label="Refresh {re.escape(label)}"[^>]*>', view)
        assert found, f"{label} has no refresh button"
        return found.group(0)

    async def test_a_reading_and_a_setpoint_both_have_one(self, client):
        view = (await client.get(self.VIEW)).text
        for pv, label in (self.READING, self.SETPOINT):
            button = self.refresh(view, label)
            assert f"pv={quote(pv + '.PROC', safe='')}&amp;value=1'" in button, button

    async def test_every_register_has_one(self, client):
        view = (await client.get(self.VIEW)).text
        rows = view.count('class="register-cell"')
        assert rows and view.count('class="register-refresh"') == rows

    async def test_processing_is_the_only_thing_it_can_write(self, client):
        """The endpoint takes 1 for a register's `.PROC` and nothing else:
        anything that can post there can post anything."""
        name = self.READING[0] + ".PROC"

        # From a desk with no control: reading a register again is shared.
        async def write(value):
            return (
                await client.post(
                    "/api/write",
                    params={"pv": name, "value": value},
                    json={},
                    headers={"Datastar-Request": "true"},
                )
            ).text

        assert "Refused" not in await write("1")
        assert "Refused" in await write("2")
        assert "Refused" in await write("now")

    async def test_pressing_it_leaves_an_open_write_panel_open(self, client):
        """Reading a register again is not leaving the write being made: an
        operator refreshes the value they are about to change."""
        view = (await client.get(self.VIEW)).text
        handler = re.search(r'data-on:click__window="([^"]*)"', view).group(1)
        assert ".register-refresh" in handler, handler


class TestARegisterReadsFromTheLeft:
    """A register tree mixes states and numbers in one column, so they all
    start at the left edge rather than numbers sitting right and states left.
    Both views are register trees; the panel's own rows are not touched."""

    async def test_numbers_are_not_pushed_right(self, client):
        css = (await client.get("/static/css/hmi.css")).text
        number = re.search(r"\.register-tree \.number\s*\{([^}]*)\}", css)
        assert number and "margin-left: 0" in number.group(1), "a number still sits right"
        units = re.search(r"\.register-tree \.value-with-units\s*\{([^}]*)\}", css)
        assert units and "justify-content: flex-start" in units.group(1), (
            "a number with a unit still sits right"
        )

    async def test_both_views_are_register_trees(self, client):
        for view in ("/l4-opcpa/NL2/registers", "/l4-opcpa/NL2/modbox"):
            assert 'class="panel register-tree"' in (await client.get(view)).text, view


class TestARegisterLabelHasRoom:
    """A register's label is a sentence ("Start peak current sampling
    window"), not a device id: the card's default column, sized for
    "Regen SY3PL50M:32", cut a fifth of them short. The tree gives its own
    card a wider one. What still does not fit ends in an ellipsis and is
    whole on hover, as every label is."""

    @staticmethod
    def rem(rule: str) -> float:
        width = re.search(r"--hmi-label-width:\s*([\d.]+)rem", rule)
        assert width, f"no label width in {rule!r}"
        return float(width.group(1))

    async def test_the_tree_widens_its_label_column(self, client):
        css = (await client.get("/static/css/hmi.css")).text
        card = re.search(r"\n\.card\s*\{([^}]*)\}", css).group(1)
        tree = re.search(r"\.register-tree \.card\s*\{([^}]*)\}", css)
        assert tree, "the tree keeps the panel's label column"
        assert self.rem(tree.group(1)) > self.rem(card), (
            "no more room for a register's label than for a device id"
        )


class TestARegisterRowIsJustItsLabel:
    """No info icon on a register: a tree of hundreds with an icon on every
    row is a column of icons. The PV is on the reading's own tooltip."""

    async def test_no_register_carries_a_hint_icon(self, client):
        view = (await client.get("/l4-opcpa/NL2/registers")).text
        assert "info-icon" not in view, "a register row still has its hint icon"

    async def test_the_reading_still_names_its_pv(self, client):
        view = (await client.get("/l4-opcpa/NL2/registers")).text
        cell = view[view.index('id="NL2-registers-r0-0"') :][:400]
        assert "L4-OPCPA-NL2:PS1225:11:" in cell, cell


class TestGettingToTheRegistersAndBack:
    """The tree replaces its laser in the laser's own column, and is left the
    way it was entered. Not a menu entry: the menu is the zone's folder
    listing, and a laser's registers belong to that laser, not to the zone."""

    VIEW = "/l4-opcpa/NL2/registers"
    SLOT = "NL2-view"

    async def test_the_panel_asks_for_the_view_in_place(self, client):
        """A request patched into the screen, not a link to another page."""
        page = (await client.get("/l4-opcpa")).text
        assert f'href="{self.VIEW}"' not in page, "the tree is still a page of its own"
        assert f"@get('{self.VIEW}')" in page, "no way to reach the tree"

    async def test_the_view_lands_in_its_laser_s_column(self, client):
        """In a slot that shares one grid item with the laser's panel: the
        column is the laser's width, so the tree is too."""
        answer = await client.get(self.VIEW)
        assert answer.headers.get("datastar-selector") == f"#{self.SLOT}"
        assert answer.headers.get("datastar-mode") == "inner"
        page = (await client.get("/l4-opcpa")).text
        title = page.index('<h2 class="panel-title">NL2</h2>')
        host = page.rindex('class="view-host"', 0, title)
        assert f'id="{self.SLOT}"></div>' in page[host:title], (
            "no empty slot ahead of the NL2 panel, in its grid item"
        )

    async def test_the_panel_steps_aside_while_the_view_is_open(self, client):
        """Hidden by the slot ahead of it having something in it, so there is
        no moment with neither on screen while the tree is on its way. A
        sibling selector rather than `:has()`, which a Firefox before 121
        drops — and with it the whole swap."""
        css = (await client.get("/static/css/hmi.css")).text
        assert re.search(r"\.view-slot:not\(:empty\) ~ \*\s*\{\s*display: none;", css), (
            "nothing hides the panel while its tree is shown"
        )
        assert ":has(> .view-slot" not in css

    async def test_the_view_is_not_a_page(self, client):
        view = (await client.get(self.VIEW)).text
        assert "<html" not in view and "</nav>" not in view, "a whole page in a slot"

    async def test_it_holds_its_own_stream_while_it_is_open(self, client):
        """Opened by the view itself and cancelled when the view is removed,
        so its monitors are someone's for exactly as long as it is shown."""
        view = (await client.get(self.VIEW)).text
        assert (
            f"@get('{self.VIEW}/stream', {{requestCancellation: 'cleanup'}})" in view
        ), view[:400]
        async with client.stream("GET", f"{self.VIEW}/stream") as stream:
            assert stream.status_code == 200
            assert stream.headers["content-type"].startswith("text/event-stream")

    async def test_it_brings_its_own_signals(self, client):
        """The screen it lands in never declared them."""
        page = (await client.get("/l4-opcpa")).text
        view = (await client.get(self.VIEW)).text
        assert "NL2_registers_selected" not in page
        signals = re.search(r'data-signals="([^"]*)"', view)
        assert signals and "NL2_registers_selected" in signals.group(1), view[:400]

    async def test_the_tree_offers_the_way_back(self, client):
        """Its own control: the way out of the tree is the way back to the
        laser. Removing the view is what stops its stream."""
        view = (await client.get(self.VIEW)).text
        back = re.search(r"<button[^>]*view-back[^>]*>", view)
        assert back, "no way back from the tree"
        # Emptied, not just the view removed: the panel comes back only when
        # the slot is `:empty`, and a stray text node would keep it hidden.
        assert "el.closest('.view-slot').replaceChildren()" in back.group(0), back.group(0)

    async def test_the_menu_is_still_the_zone_s_folders(self, client):
        page = (await client.get("/l4-opcpa")).text
        menu = page[page.index('class="nav"') : page.index("</nav>")]
        assert "registers" not in menu, "a detail view crept into the menu"


class TestWritingARegister:
    """One write panel for the register being looked at, rather than a control
    on every row: a module has dozens of registers and most are readings, and
    the panel is where the device's own limits and choices are shown."""

    SETPOINT = "L4-OPCPA-NL2:PS1225:11:SetPoint"
    READING = "L4-OPCPA-NL2:PS1225:11:T_out"

    async def test_only_a_setpoint_offers_to_be_written(self, client):
        page = (await client.get("/l4-opcpa/NL2/registers")).text
        assert self.SETPOINT in page and self.READING in page, "registers missing"
        # By what each control is for, rather than by position: a row's value
        # cell is long enough to push its action column out of any window.
        assert 'aria-label="Set Setpoint"' in page, "a setpoint cannot be selected"
        assert 'aria-label="Set Outlet temp"' not in page, "a reading offers a write"

    async def test_selecting_one_opens_a_panel_that_writes_it(self, client):
        """The write goes to the register's own PV with `:W` appended — the
        device's convention, derived so it cannot be mistyped."""
        answer = await client.get(
            "/api/register",
            params={"component": "NL2-registers", "pv": self.SETPOINT},
        )
        body = answer.text
        assert "Setpoint" in body, "the panel does not name the register"
        assert quote(f"{self.SETPOINT}:W", safe="") in body, (
            f"the write does not go to the setpoint record: {body!r}"
        )


class TestTheDeviceSuppliesItsOwnLimits:
    """A register's range is in its control fields, not in the config.

    Monitors deliberately ask for `FORMAT_TIME` — the control fields are a
    heavier request, and there are hundreds of registers. So they are read
    once, for the one register being written, when it is selected.
    """

    async def test_the_panel_offers_the_range_the_device_accepts(self, client):
        body = (
            await client.get(
                "/api/register",
                params={
                    "component": "NL2-registers",
                    "pv": "L4-OPCPA-NL2:PS1225:11:SetPoint",
                },
            )
        ).text
        # In the control, not as `min`/`max` on the field: the field holds
        # text so that a half-typed decimal survives, so the range lives in
        # what greys Confirm out and in what the row says when it does.
        assert "18" in body and "28" in body, f"no range from the device: {body!r}"
        assert "out of range (18" in body, f"nothing says what is allowed: {body!r}"


class TestARegisterWithChoices:
    async def test_the_panel_offers_the_states_the_device_has(self, client):
        """An enum register is written by name, not by index — and the names
        are the record's, not the config's."""
        body = (
            await client.get(
                "/api/register",
                params={
                    "component": "NL2-registers",
                    "pv": "L4-OPCPA-NL2:PS1225:11:Mode",
                },
            )
        ).text
        assert "STANDBY" in body and "SERVICE" in body, f"no choices: {body!r}"
        assert "<select" in body, "a state register offers a number field"
        assert "Waveform" not in body, (
            "the prompt is the waveform control's, on a register that is not one"
        )


class TestTheWritePanelAppearsUnderItsRegister:
    """A tree is hundreds of rows long. A panel at the foot of it would be
    off-screen from the register it belongs to, and an operator would have no
    way to tell which row it was written for."""

    async def test_every_writable_register_has_a_slot_under_its_row(self, client):
        """Between this register's row and the next one — measured against the
        row that follows rather than a count of characters, which only says
        how long the markup happens to be today."""
        page = (await client.get("/l4-opcpa/NL2/registers")).text
        setpoint = page.index("L4-OPCPA-NL2:PS1225:11:SetPoint")
        next_row = page.index("L4-OPCPA-NL2:PS1225:11:Mode", setpoint)
        assert 'class="register-write"' in page[setpoint:next_row], (
            "the panel does not follow the register it writes"
        )

    async def test_the_panel_is_patched_into_that_register_s_slot(self, client):
        body = (
            await client.get(
                "/api/register",
                params={
                    "component": "NL2-registers",
                    "pv": "L4-OPCPA-NL2:PS1225:11:SetPoint",
                },
            )
        ).text
        selector = re.search(r"data: selector (\S+)", body).group(1)
        assert selector != "#NL2-registers-write", (
            "every register still shares one panel at the foot of the tree"
        )
        page = (await client.get("/l4-opcpa/NL2/registers")).text
        assert selector.lstrip("#") in page, f"{selector} is not on the page"


class TestThePanelsSignalsExistBeforeThePanelDoes:
    """Every signal is declared with the page, never created by the markup
    that first mentions it — the rule `Component.signal` states. A panel is
    patched in later, so a signal it binds would otherwise spring into
    existence on the first selection, and a control bound to one that does
    not exist yet cannot report what was chosen.
    """

    async def test_the_write_field_binds_a_declared_signal(self, client):
        page = (await client.get("/l4-opcpa/NL2/registers")).text
        # Every declaration on the page: the document element declares the
        # palette, and the page its own.
        declared = " ".join(re.findall(r'data-signals="([^"]*)"', page))
        panel = (
            await client.get(
                "/api/register",
                params={
                    "component": "NL2-registers",
                    "pv": "L4-OPCPA-NL2:PS1225:11:Mode",
                },
            )
        ).text
        bound = set(re.findall(r'data-bind="([^"]+)"', panel))
        assert bound, "the panel binds nothing"
        missing = [name for name in bound if name not in declared]
        assert not missing, f"bound but never declared: {missing}"


def confirm_for(page: str, status_id: str) -> str:
    """One control's Confirm button, found by the status line it reports to.

    By index rather than by pattern: the disabled expression contains `>`
    characters, so a regex for a tag stops in the middle of one. The preset
    chips report to the same status line, so it is the Confirm among them
    that is wanted.
    """
    found = []
    at = page.find('class="preset-confirm"')
    while at != -1:
        start = page.rindex("<button", 0, at)
        end = page.index("</button>", at)
        block = page[start:end]
        if status_id in block:
            found.append(block)
        at = page.find('class="preset-confirm"', end)
    assert found, f"no Confirm reports to {status_id}"
    return found[0]


class TestEverySetpointFieldSurvivesBeingTyped:
    """`type="number"` reports a field as empty while its contents are not yet
    a number — `21.`, `-`, `1e`. With a two-way binding that empty value goes
    to the signal and straight back to the element, so the character just
    typed disappears and the caret jumps to the front. Mid-edit states have to
    be allowed to exist, so the field holds text and the value is checked
    rather than the keystrokes being policed.
    """

    async def fields(self, client) -> list[str]:
        page = (await client.get("/l4-opcpa")).text
        found = re.findall(r"<input class=\"preset-field\"[^>]*>", page, re.S)
        assert found, "no setpoint fields on the screen"
        return found

    async def test_none_of_them_is_a_number_input(self, client):
        bad = [f for f in await self.fields(client) if 'type="number"' in f]
        assert not bad, (
            f"{len(bad)} field(s) will erase a half-typed decimal as it is typed"
        )

    async def test_they_still_ask_for_a_numeric_keypad(self, client):
        """With a decimal point, or — for an integer like the trigger delay —
        without one."""
        for field in await self.fields(client):
            assert 'inputmode="decimal"' in field or 'inputmode="numeric"' in field, field

    async def test_confirm_refuses_what_is_not_a_number(self, client):
        """Without the browser's own validation the control does it: `21.` is
        a fine thing to be typing and not a fine thing to send. An integer
        field holds the value to the whole-number pattern instead."""
        page = (await client.get("/l4-opcpa")).text
        assert "[0-9]" in confirm_for(page, "NL2-set-trigger-delay-status")
        panel = (
            await client.get(
                "/api/register",
                params={"component": "NL2-registers", "pv": "L4-OPCPA-NL2:PS1225:11:SetPoint"},
            )
        ).text
        assert "isNaN" in confirm_for(panel, "status=")


class TestTheWriteFieldStartsEmpty:
    """Choosing a register is starting a new write.

    One signal carries the value for whichever register is open, so without
    clearing it a number typed for one register is still loaded when the next
    is selected — a field reading blank while Confirm is live, and the old
    number going to the new record.
    """

    async def test_selecting_a_register_clears_what_was_typed(self, client):
        body = (
            await client.get(
                "/api/register",
                params={
                    "component": "NL2-registers",
                    "pv": "L4-OPCPA-NL2:PS1225:11:Mode",
                },
            )
        ).text
        assert '"NL2_registers_set_register":""' in body, (
            f"the previous register's value is still loaded: {body!r}"
        )


class TestWritingAStateByName:
    """A state record takes a name, and a name is not a number — so none of
    the checks a numeric field needs may be applied to it."""

    async def test_a_state_with_an_e_in_it_goes_through(self, client):
        pv = "L4-OPCPA-NL2:PS1225:11:Mode"
        await client.get(
            "/api/register", params={"component": "NL2-registers", "pv": pv}
        )
        answer = await write(client, params={"pv": f"{pv}:W", "value": "SERVICE"}, json={}
        )
        assert "Refused" not in answer.text, answer.text
        assert "SERVICE" in answer.text


class TestWritingToNonVolatileMemory:
    """Some registers can be written to the device's non-volatile memory, and
    a single PV per laser arms it. The control is live — it shows what the
    device is armed to do, not what this browser last asked for — and it is
    offered only for the registers that support it."""

    async def test_the_panel_says_whether_the_write_is_permanent(self, client):
        """In the panel, beside the value it applies to — not standing apart
        from the write it arms."""
        panel = (
            await client.get(
                "/api/register",
                params={
                    "component": "NL2-registers",
                    "pv": "L4-OPCPA-NL2:PS1225:11:SetPoint",
                },
            )
        ).text
        assert "non-volatile" in panel.lower(), "nothing says whether NV is armed"
        assert quote("L4-OPCPA-NL2:UseNVMemory", safe="") in panel, (
            "the arming PV is not written by the control"
        )

    async def test_the_tree_itself_does_not_carry_it(self, client):
        page = (await client.get("/l4-opcpa/NL2/registers")).text
        assert "non-volatile" not in page.lower(), (
            "the arming control stands apart from the write it arms"
        )


class TestARegisterWriteIsHeldToTheDeviceRange:
    """The field greys out its Confirm for a value outside the range the
    device gave — but this endpoint is the one route to a write, and anything
    that can post to it can post anything. The register's limits are recorded
    when it is selected, and the write is held to them.
    """

    async def test_a_value_the_device_will_not_take_is_refused(self, client):
        await client.get(
            "/api/register",
            params={
                "component": "NL2-registers",
                "pv": "L4-OPCPA-NL2:PS1225:11:SetPoint",
            },
        )
        answer = await write(client, params={"pv": "L4-OPCPA-NL2:PS1225:11:SetPoint:W", "value": "99"},
            json={},
        )
        assert "Refused" in answer.text, (
            f"99 is outside the device's 18-28 and went through: {answer.text!r}"
        )

    async def test_a_value_it_will_take_goes_through(self, client):
        await client.get(
            "/api/register",
            params={
                "component": "NL2-registers",
                "pv": "L4-OPCPA-NL2:PS1225:11:SetPoint",
            },
        )
        answer = await write(client, params={"pv": "L4-OPCPA-NL2:PS1225:11:SetPoint:W", "value": "21"},
            json={},
        )
        assert "Refused" not in answer.text, answer.text


class TestTheTreeLooksLikeTheRestOfTheApp:
    async def test_a_register_is_an_ordinary_row(self, client):
        """Not a list of its own invention: the label column and the right
        edge are the card's, so a register reads like every other reading in
        the HMI and nothing new has to be kept aligned."""
        page = (await client.get("/l4-opcpa/NL2/registers")).text
        tree = page[page.index("register-tree") :]
        assert '<div class="row"' in tree, "the tree built its own geometry"

    async def test_a_writable_row_is_as_wide_as_a_read_only_one(self, client):
        """The Set button shares the value column rather than taking an action
        column of its own: a row's reading would otherwise be narrower for
        being writable, and a column of numbers has to line up to be read."""
        page = (await client.get("/l4-opcpa/NL2/registers")).text
        tree = page[page.index("register-tree") :]
        rows = re.findall(r'<div class="row" data-has-action="(\w+)"', tree)
        assert rows, "no rows at all"
        assert set(rows) == {"false"}, (
            "a register row took an action column, narrowing its value"
        )

    async def test_a_module_says_whether_it_is_open(self, client):
        page = (await client.get("/l4-opcpa/NL2/registers")).text
        assert "aria-expanded" in page, "a collapsed module announces nothing"

    async def test_every_signal_on_the_page_is_one_identifier(self, client):
        """`$a-b` is a subtraction, not a signal: a name that is not an
        identifier fails silently in the browser and passes every test that
        only reads the markup."""
        page = (await client.get("/l4-opcpa/NL2/registers")).text
        bad = [
            name
            for name in set(re.findall(r"\$([A-Za-z0-9_-]+)", page))
            if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name)
        ]
        assert not bad, f"unusable in an expression: {sorted(bad)}"


class TestRegisterMonitorsAreNotOnTheScreen:
    """The whole reason the tree holds its own stream.

    A register belongs to the detail view's index and to no other, so the
    screen the panels live on never subscribes it. Hundreds of rows per laser
    would otherwise be streamed to every operator with that screen open,
    whether or not anyone ever looks at a register.
    """

    def pages(self):
        from core.jinja import create_environment
        from core.page import build_pages
        from core.zones import load_zone

        return build_pages(load_zone("TESTZ"), create_environment())

    def test_the_screen_does_not_subscribe_them(self):
        pages = self.pages()
        screen = {pv.name for pv in pages["l4-opcpa"].all_pvs}
        detail = {pv.name for pv in pages["l4-opcpa/NL2/registers"].all_pvs}
        register = "L4-OPCPA-NL2:PS1225:11:SetPoint"

        assert register in detail, "the detail view is not reading it either"
        assert register not in screen, (
            "a register is monitored for everyone on the panel screen"
        )

    def test_the_detail_view_reads_nothing_but_its_registers(self):
        """It is the laser's registers and the PV that arms a non-volatile
        write — not a second copy of the panel."""
        from core.zones import load_zone

        laser = next(
            component.config
            for component in load_zone("TESTZ").gui("l4-opcpa").components
            if getattr(component.config, "id", None) == "NL2"
        )
        # What the config declares, whatever the modules are called.
        own = {register.pv for module in laser.modules for register in module.registers}
        own.add(laser.nv_write)

        pages = self.pages()
        detail = {pv.name for pv in pages["l4-opcpa/NL2/registers"].all_pvs}
        assert detail, "no registers at all"
        extra = detail - own
        assert not extra, f"the tree reads something that is not its own: {extra}"


class TestLabelsAndUnits:
    async def test_the_bias_values_are_in_millivolts(self, client):
        """The amplifier reports millivolts. The simulator's EGU said volts and
        no config overrode it, so the panel was off by a factor of a thousand
        in the only place an operator would read it."""
        page = (await client.get("/l4-opcpa")).text
        assert "mV" in page
        assert "Bias Value (" not in page, "the unit belongs beside the value, not in the label"

    async def test_a_chiller_row_says_what_it_is(self, client):
        page = (await client.get("/l4-opcpa")).text
        assert "Chiller PS1225:11" in page


class TestCollapse:
    """An expanded list closes when its own trigger is pressed again, and at no
    other time.

    It used to close on a click anywhere, which is what the original spec
    asked for. In use that lost the comparison an operator had opened it to
    make: reading a failed MSS permission against the module error codes meant
    opening one list, looking away, and finding it shut. Any number may now be
    open at once, and a cog panel is the one thing that still closes itself
    (see `TestCogPanels`) — it covers the screen, where a list sits in the
    flow of it.
    """

    TOGGLES = (
        "Toggle MSS detail",
        "Toggle ERR detail",
        "Toggle Modbox State detail",
        "Toggle Flashlamps channel detail",
    )

    async def test_no_list_closes_itself_on_a_click_elsewhere(self, client):
        page = (await client.get("/l4-opcpa")).text
        for label in self.TOGGLES:
            element = page[page.index(f'aria-label="{label}"') - 400 :][:600]
            assert "click__window" not in element, f"{label} still closes on an outside click"

    async def test_the_rule_is_not_repeated_per_control(self, client):
        """Whatever closes a panel is declared once. Three copies of the rule
        is how the lists and the cogs drifted apart in the first place."""
        page = (await client.get("/l4-opcpa")).text
        # The only outside-click handler left is the cog's, from one macro.
        assert page.count("click__window") == page.count("cog-wrapper') === el")


class TestRowHints:
    """Two Modbox rows need explaining, and the explanation has to reach
    someone who is not hovering a mouse over it."""

    HINTS = (
        "Waveform sent in ModBox ON sequence",
        "Last waveform sent to the laser",
    )

    async def test_the_waveform_rows_explain_themselves(self, client):
        page = (await client.get("/l4-opcpa")).text
        for hint in self.HINTS:
            assert f'aria-label="{hint}"' in page, f"{hint!r} is not readable without a mouse"
            assert f'title="{hint}"' in page, f"{hint!r} does not appear on hover"


class TestSetpointField:
    async def test_custom_appears_only_next_to_presets(self, client):
        """"Custom" means "not one of these" — with no chips beside it there is
        nothing for it to contrast with, and it labels the only field there is."""
        page = (await client.get("/l4-opcpa")).text
        assert page.count("preset-custom-label") == page.count("preset-chips")

    async def test_a_field_without_presets_is_named_after_its_control(self, client):
        """Dropping the visible label must not leave the field unnamed."""
        page = (await client.get("/l4-opcpa")).text
        assert 'aria-label="Set Attenuator"' in page


class TestInlineWriteStatus:
    """A failure belongs beside the control that caused it.

    The header toast is nowhere near the button on a 22rem panel, and it ages
    out on its own — an operator who looked away has no way to find out what
    happened. React reports under the button; so does this.
    """

    async def _write(self, text: str):
        return await write(self.client, params={
                "pv": "L4-OPCPA-NL2:PS5059:22:SetBothChannelsTrigDelay",
                "signal": "v",
                "status": "nl2-delay-status",
                "close": "cog_delay",
            },
            json={"v": text},
            headers={"Datastar-Request": "true"},
        )

    @pytest.fixture(autouse=True)
    def _bind(self, client):
        self.client = client

    async def test_a_refusal_lands_on_the_control_that_caused_it(self, client):
        response = await self._write("60001")
        assert "patch-elements" in response.text
        assert "nl2-delay-status" in response.text
        assert "out of range" in response.text

    async def test_a_successful_write_clears_the_message(self, client):
        """Stale errors are worse than none: the next attempt has to wipe the
        last one, or a fixed problem still reads as broken."""
        response = await self._write("500")
        assert "nl2-delay-status" in response.text
        assert "out of range" not in response.text

    async def test_a_refusal_leaves_the_panel_open_to_show_it(self, client):
        """The message lives inside the cog panel. Closing the panel on the
        press meant a refusal was only seen the *next* time the panel was
        opened, attached to an attempt the operator had forgotten about."""
        response = await self._write("60001")
        assert "patch-signals" not in response.text or '"cog_delay":false' not in response.text

    async def test_a_successful_write_closes_the_panel(self, client):
        """Nothing to read on success — the value itself has changed on screen
        — so the panel gets out of the way."""
        response = await self._write("500")
        assert '"cog_delay":false' in response.text

    async def test_the_message_does_not_repeat_the_pv_name(self, client):
        """It sits under the control that caused it, in a 14rem panel: the
        name is redundant there and overflowed the box."""
        response = await self._write("60001")
        status = response.text[response.text.index("nl2-delay-status") :]
        assert "L4-OPCPA-NL2" not in status[: status.index("</span>")]

    async def test_every_control_carries_a_status_target(self, client):
        page = (await client.get("/l4-opcpa")).text
        assert "status=" in page, "no control names where its failures should go"


class TestWaveformRefresh:
    """The Modbox's list changes while the machine runs, so the control asks
    the device again each time it is opened."""

    @staticmethod
    def refresh_url(page: str) -> str:
        match = re.search(r"@get\('(/api/waveforms[^']*)'\)", page)
        assert match, "opening the cog never re-reads the catalog"
        return match.group(1).replace("&amp;", "&")

    async def test_opening_the_cog_re_reads_the_catalog(self, client):
        """The patch lands INSIDE the select, so the element, its binding and
        anything typed beside it survive; only the options change."""
        url = self.refresh_url((await client.get("/l4-opcpa")).text)

        response = await client.get(url)
        assert response.status_code == 200
        assert "datastar-patch-elements" in response.text
        assert "std-100ps" in response.text, "the current catalog is not in the patch"
        assert "mode inner" in response.text, "replacing the <select> would drop its binding"

    async def test_the_refreshed_options_look_like_the_rendered_ones(self, client):
        """The patch replaces the whole option list, so it has to carry the
        same prompt the template does — otherwise opening the control quietly
        reverts it, which is how one of the two waveform selectors ended up
        with the old wording."""
        url = self.refresh_url((await client.get("/l4-opcpa")).text)
        patch = (await client.get(url)).text
        assert "Select Waveform" in patch
        assert "hidden" in patch and "disabled" in patch

    async def test_an_unknown_component_patches_nothing(self, client):
        """204, not an error page: a refresh for something that is not there
        changes nothing, and nothing is what the browser should apply."""
        response = await client.get("/api/waveforms", params={"component": "nope"})
        assert response.status_code == 204
        assert "patch-elements" not in response.text


class TestOptionalCommands:
    """A command the laser under test does not have is simply not configured.

    `commands:` is the whole gate — no fail-open default — so a laser that
    never lists SEND_YDFA_CURRENT has no YDFA control anywhere on its screen,
    while the component keeps supporting it for one that does (see
    `TestYdfaCurrent` in test_laser_panel.py).
    """

    async def test_an_unlisted_command_has_no_control(self, client):
        # Not "YDFA": the Modbox state list has a `YDFA state` *readout*, which
        # is a different thing and stays.
        page = (await client.get("/l4-opcpa")).text
        assert "Send YDFA current" not in page
        assert "YDFA current" not in page

    async def test_and_no_pv_is_monitored_for_it(self, client):
        stats = (await client.get("/stats")).json()
        assert stats["monitored_pvs"] > 0
        page = (await client.get("/l4-opcpa")).text
        assert "SEND_YDFA_CURRENT" not in page


class TestAuthGate:
    """Nothing is served to someone who has not signed in.

    The gate is middleware rather than a per-route dependency precisely so that
    these tests cover screens nobody has written yet: a screen is a folder, and
    a folder cannot forget to declare a dependency.
    """

    async def test_a_screen_redirects_to_the_form_and_remembers_where(self, anonymous):
        response = await anonymous.get("/chillers", follow_redirects=False)
        assert response.status_code == 307
        assert response.headers["location"] == "/login?next=/chillers"

    async def test_a_screens_stream_sends_the_browser_to_the_form(self, anonymous):
        """What a page open past its session sees when its stream reconnects.
        A plain redirect would have Datastar patch the form's HTML into the
        screen, and a 401 left the page frozen under a banner blaming the live
        link. A Datastar redirect says what actually happened."""
        response = await anonymous.get(
            "/l4-opcpa/stream", headers={"Datastar-Request": "true"}, follow_redirects=False
        )
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        assert "window.location = '/login?next=/l4-opcpa'" in response.text

    async def test_a_write_sends_the_browser_to_the_form_for_its_screen(self, anonymous):
        response = await anonymous.post(
            "/api/write",
            params={"pv": "L4-OPCPA-NL2:IO:15:RC1_pin31", "value": "1"},
            json={},
            headers={
                "Datastar-Request": "true",
                "Referer": str(anonymous.base_url.join("/chillers")),
            },
        )
        assert response.status_code == 200
        assert "window.location = '/login?next=/chillers'" in response.text

    async def test_machinery_without_a_browser_still_gets_401(self, anonymous):
        """curl, a script, a probe: nothing there to send to a form."""
        stream = await anonymous.get("/l4-opcpa/stream", follow_redirects=False)
        assert stream.status_code == 401
        assert stream.json()["login"] == "/login"
        write = await anonymous.post(
            "/api/write", params={"pv": "L4-OPCPA-NL2:IO:15:RC1_pin31", "value": "1"}, json={}
        )
        assert write.status_code == 401

    async def test_using_a_screen_renews_the_session(self, client):
        """The window is how long a station may sit unused, not how long a
        sign-in lasts: a screen in use never signs its operator out."""
        response = await client.get("/l4-opcpa")
        assert "eli_hmi_session=" in response.headers.get("set-cookie", "")

    async def test_so_does_the_stream_reconnecting(self, client):
        """A screen left open overnight makes no request but its stream. When
        that reconnects after a blip, it is what keeps the sign-in alive."""
        async with client.stream(
            "GET", "/l4-opcpa/stream", headers={"Datastar-Request": "true"}
        ) as response:
            assert response.status_code == 200
            assert "eli_hmi_session=" in response.headers.get("set-cookie", "")

    async def test_health_stays_open_for_the_container_probe(self, anonymous):
        """A probe has no browser and no credentials; a liveness check that
        needed a session would restart a healthy container."""
        assert (await anonymous.get("/health/live")).status_code == 200
        assert (await anonymous.get("/health/ready")).status_code == 200

    async def test_the_login_page_can_load_its_own_stylesheet(self, anonymous):
        assert (await anonymous.get("/login")).status_code == 200
        assert (await anonymous.get("/static/css/hmi.css")).status_code == 200

    async def test_a_wrong_password_says_nothing_useful_to_a_stranger(self, anonymous):
        response = await anonymous.post(
            "/login", data={"username": "test", "password": "wrong"}, follow_redirects=False
        )
        assert response.status_code == 401
        assert "Sign-in failed." in response.text
        # Not "no such user", not "wrong password", not the directory's words.
        assert "invalid" not in response.text.lower()

    async def test_next_cannot_be_talked_into_leaving_the_site(self, anonymous):
        """`?next=https://elsewhere/` would make the station's own login form a
        step in a phishing chain."""
        for hostile in ("https://evil.example/", "//evil.example/", "javascript:alert(1)"):
            response = await anonymous.post(
                "/login",
                data={"username": "test", "password": "test", "next": hostile},
                follow_redirects=False,
            )
            assert response.status_code == 303
            assert response.headers["location"] == "/l4-opcpa"

    async def test_signing_in_lands_on_the_screen_that_was_asked_for(self, anonymous):
        response = await anonymous.post(
            "/login",
            data={"username": "test", "password": "test", "next": "/vacuum"},
            follow_redirects=False,
        )
        assert response.headers["location"] == "/vacuum"

    async def test_the_session_cookie_is_not_readable_by_script(self, anonymous):
        response = await anonymous.post(
            "/login", data={"username": "test", "password": "test"}, follow_redirects=False
        )
        cookie = response.headers["set-cookie"].lower()
        assert "httponly" in cookie
        assert "samesite=lax" in cookie

    async def test_signing_out_ends_the_session(self, client):
        assert (await client.get("/l4-opcpa")).status_code == 200
        response = await client.post("/logout", follow_redirects=False)
        assert response.status_code == 303
        assert response.headers["location"] == "/login"
        after = await client.get("/l4-opcpa", follow_redirects=False)
        assert after.status_code == 307

    async def test_a_forged_cookie_is_not_a_session(self, anonymous):
        """The signature is the whole security of a stateless session."""
        import base64
        import json

        payload = base64.urlsafe_b64encode(
            json.dumps({"u": "root", "v": "ldap", "iat": 0, "exp": 9999999999}).encode()
        ).decode().rstrip("=")
        anonymous.cookies.set("eli_hmi_session", f"{payload}.not-a-real-signature")
        response = await anonymous.get("/l4-opcpa", follow_redirects=False)
        assert response.status_code == 307

    async def test_the_signed_in_user_is_on_the_page(self, client):
        """An operator should be able to see whose account is writing to the
        machine — a shift handover where the previous person is still signed in
        is exactly when a write gets attributed to the wrong name."""
        body = (await client.get("/l4-opcpa")).text
        assert 'class="nav-user"' in body
        assert ">test<" in body
        assert 'action="/logout"' in body


class TestAWordWrittenToANumericSetpoint:
    """A setpoint that takes a number takes nothing else.

    The range check used to stand aside for any value that was not already a
    number, so `SERVICE` typed into the trigger delay passed every guard and
    reached the device, where it failed as a type error with no one to tell.
    """

    DELAY = "L4-OPCPA-NL2:PS5059:22:SetBothChannelsTrigDelay"

    async def test_it_is_refused_before_it_reaches_the_device(self, client):
        response = await write(client, params={"pv": self.DELAY, "value": "SERVICE"},
            json={},
            headers={"Datastar-Request": "true"},
        )
        assert "Refused" in response.text, response.text
        assert "number" in response.text


class TestFiftyAndClose:
    """An NL laser offers "50 + Close" beside its trigger-delay presets: one
    press, written to a PV of its own. A laser that names no such PV shows
    the presets as they always were."""

    TAG = r'(?:[^>"]|"[^"]*")*>'

    @staticmethod
    def chips(page: str, laser: str) -> str:
        start = page.index(f'<h2 class="panel-title">{laser}</h2>')
        cog = page.index('aria-label="Set trigger delay"', start)
        return page[page.index('class="preset-chips"', cog) : page.index('class="preset-custom"', cog)]

    async def test_it_is_the_last_chip_and_writes_50_to_its_own_pv(self, client):
        chips = self.chips((await client.get("/l4-opcpa")).text, "NL2")
        labels = [label.strip() for label in re.findall(r">([^<>]+)</button>", chips)]
        assert labels == ["50", "500", "700", "790", "50 + Close"], labels
        button = re.search(r'<button[^>]*class="preset-chip"' + self.TAG + r"\s*50 \+ Close", chips).group(0)
        assert "pv=CMD_NL2_DELAY_50_CLOSE&amp;value=50" in button

    async def test_a_laser_without_it_shows_the_presets_as_before(self, client):
        chips = self.chips((await client.get("/l4-opcpa")).text, "NL4")
        labels = [label.strip() for label in re.findall(r">([^<>]+)</button>", chips)]
        assert labels == ["50", "500", "790"], labels


class TestTheAttenuatorTakesAWholePosition:
    """The attenuator is set to a step position, so its setpoint is an
    integer: the field cannot take a decimal point, and the endpoint refuses
    a fraction rather than sending it to be truncated by the record."""

    SET = "L4-OPCPA-NL2:SM5-ATT1:51:SetPosition"

    async def _write(self, client, text: str):
        return await write(client, params={"pv": self.SET, "value": text},
            json={},
            headers={"Datastar-Request": "true"},
        )

    async def test_a_fraction_is_refused(self, client):
        response = await self._write(client, "51.5")
        assert "Refused" in response.text and "whole number" in response.text, response.text

    async def test_a_word_is_refused(self, client):
        response = await self._write(client, "OPEN")
        assert "Refused" in response.text, response.text

    async def test_a_whole_position_is_written(self, client):
        response = await self._write(client, "52")
        assert "Refused" not in response.text, response.text

    async def test_confirm_holds_the_value_to_a_whole_number(self, client):
        page = (await client.get("/l4-opcpa")).text
        confirm = confirm_for(page, "NL2-set-attenuator-status")
        assert "[0-9]" in confirm and "isNaN" not in confirm, confirm


class TestTheWritePanelOpensAndShutsLikeACog:
    """A SET button is a disclosure, and every other disclosure on these
    screens behaves one way: pressing it again shuts it, a click anywhere else
    shuts it, and while it is open the button is filled in so an operator can
    see at a glance which row the panel below belongs to."""

    @staticmethod
    def set_button(page: str) -> str:
        """The SET button of the chiller setpoint."""
        end = page.index('aria-label="Set Setpoint"')
        return page[page.rindex("<button", 0, end) : end]

    async def test_pressing_set_again_shuts_the_panel(self, client):
        page = (await client.get("/l4-opcpa/NL2/registers")).text
        button = self.set_button(page)
        assert "L4-OPCPA-NL2:PS1225:11:SetPoint" in button, (
            "the button does not know which register it is already showing"
        )
        assert "= ''" in button, "pressing it again cannot clear the selection"

    async def test_a_click_anywhere_else_shuts_it(self, client):
        page = (await client.get("/l4-opcpa/NL2/registers")).text
        tree = page[page.index('class="panel register-tree"') :][:600]
        assert "click__window" in tree, "nothing watches for a click outside"
        assert "register-write" in tree and "register-select" in tree, (
            "a click on the panel itself, or on another SET, would shut it"
        )

    async def test_the_open_button_is_filled_in(self, client):
        page = (await client.get("/l4-opcpa/NL2/registers")).text
        assert "aria-expanded" in self.set_button(page), (
            "the button never says whether its panel is open"
        )
        css = (await client.get("/static/css/hmi.css")).text
        assert ".register-select[aria-expanded='true']" in css, (
            "an open SET button looks the same as a shut one"
        )


class TestTheNvControlIsOnlyWhereItApplies:
    """A register that cannot be written to non-volatile memory has nothing to
    arm, and a control that is there but dead still asks to be read — and
    the indicator beside it would report a state that does not concern this
    write. So neither is drawn for it."""

    @staticmethod
    async def select(client, pv: str) -> str:
        return (
            await client.get(
                "/api/register", params={"component": "NL2-registers", "pv": pv}
            )
        ).text

    async def test_a_register_without_nv_shows_neither_control_nor_indicator(
        self, client
    ):
        panel = await self.select(client, "L4-OPCPA-NL2:PS1225:11:Mode")
        assert "non-volatile" not in panel.lower(), "the NV control is drawn anyway"
        assert "UseNVMemory" not in panel and "nv-status" not in panel, (
            "the NV control's status line is drawn anyway"
        )

    async def test_a_register_with_nv_has_the_box_and_its_status_line(self, client):
        panel = await self.select(client, "L4-OPCPA-NL2:PS1225:11:SetPoint")
        assert 'class="nv-box"' in panel
        assert 'id="NL2-registers-nv-status"' in panel, (
            "a refused NV write has nowhere beside the box to say so"
        )

    async def test_only_the_open_panel_holds_the_nv_widget(self, client):
        """Hidden slots used to keep whatever they last held. Open the NV
        setpoint of one module, then of the next, and the page held two
        copies of the live NV widget under one id — and a live update goes to
        the first element with that id, which was the stale, hidden one. Each
        selection empties every slot before it fills its own."""
        body = await self.select(client, "L4-OPCPA-NL2:PS1225:12:SetPoint")
        clear = body.find("data: mode remove\ndata: selector .register-write > *")
        fill = body.find("data: mode inner")
        assert clear != -1, "the other slots keep their old panels"
        assert clear < fill, "the slots are emptied after the new panel lands"


class TestAFailedWriteIsPutRight:
    """Controls are optimistic: a checkbox ticks the moment it is pressed,
    because waiting a round trip for the device to confirm feels broken. The
    price is that a write the device refuses leaves the control showing what
    the operator meant. So a failure is said, beside the control, and then the
    PV is read again and whatever displays it is redrawn from the answer."""

    NV = "L4-OPCPA-NL2:UseNVMemory"
    STATUS = "NL2-registers-nv-status"

    @pytest.fixture
    async def refusing(self):
        """The app, with a device that refuses every write and, read again
        afterwards, reports NV as armed — which the simulator's cache does
        not, so a redraw that shows it armed came from the fresh read."""
        from core.epics.types import PvSample
        from core.server import create_app
        from core.settings import Settings

        app = create_app(
            Settings(
                zone_code="TESTZ",
                epics_backend="sim",
                sim_tick_seconds=10,
                log_level="WARNING",
                dev=True,
                session_secret="test-only-secret",
            )
        )
        async with app.test_app() as running:
            hub = app.hmi.hub

            async def refuse(name, value):
                raise RuntimeError("CA timeout")

            async def armed(pv):
                return PvSample(name=pv.name, ok=True, value=1, timestamp=1.0)

            hub.caput = refuse
            hub.caget = armed
            client = running.test_client()
            await client.post("/login", form={"username": "test", "password": "test"})
            # The NV arm is NL2's, and NL2 is under control: this desk has it,
            # so what is refused is the device's doing.
            await client.post(
                "/api/lock",
                query_string={"pv": self.NV, "action": "take"},
                json={"tab": "desk"},
                headers={"Datastar-Request": "true"},
            )
            yield client

    async def write(self, client) -> str:
        response = await client.post(
            "/api/write",
            query_string={"pv": self.NV, "value": "0", "status": self.STATUS},
            json={"tab": "desk"},
            headers={"Datastar-Request": "true"},
        )
        return (await response.get_data()).decode()

    async def test_the_failure_is_said_beside_the_control(self, refusing):
        body = await self.write(refusing)
        assert f'id="{self.STATUS}"' in body and "CA timeout" in body, body

    async def test_the_control_is_redrawn_from_what_the_device_holds(self, refusing):
        body = await self.write(refusing)
        assert 'class="nv-toggle"' in body, "nothing displaying the PV was redrawn"
        widget = body[body.index('class="nv-toggle"') :]
        assert "checked" in widget.split("</label>")[0], (
            "the box was not put back to what the device reported"
        )

    async def test_the_message_does_not_wait_for_the_read(self, refusing):
        """A channel that refused a write may not answer a read either, and an
        operator should not wait out a second timeout to learn the first."""
        body = await self.write(refusing)
        assert body.index(self.STATUS) < body.index('class="nv-toggle"')


class TestTheWritePanelLayout:
    """The panel sits directly under the register it writes, so the row has
    already named it. What the panel holds is the field, its unit, and the
    button that sends it — in that order, on one line."""

    SETPOINT = "L4-OPCPA-NL2:PS1225:11:SetPoint"
    MODE = "L4-OPCPA-NL2:PS1225:11:Mode"

    @staticmethod
    async def panel(client, pv: str) -> str:
        body = (
            await client.get(
                "/api/register", params={"component": "NL2-registers", "pv": pv}
            )
        ).text
        return body[body.index("register-write-inner") :]

    @staticmethod
    def visible(markup: str) -> str:
        """Text an operator sees: tags and their attributes removed."""
        return " ".join(re.sub(r"<[^>]*>", " ", markup).split())

    async def test_the_register_is_not_named_again(self, client):
        for pv, label in ((self.SETPOINT, "Setpoint"), (self.MODE, "Mode")):
            panel = await self.panel(client, pv)
            assert label not in self.visible(panel), (
                f"the panel repeats {label!r}, which the row above already says"
            )

    async def test_the_unit_sits_between_the_field_and_confirm(self, client):
        panel = await self.panel(client, self.SETPOINT)
        field = panel.index('class="preset-field"')
        unit = panel.index("°C")
        confirm = panel.index('class="preset-confirm"')
        assert field < unit < confirm, "the unit is not beside the value it qualifies"

    async def test_confirm_is_to_the_right_of_the_field(self, client):
        """In a cog panel the field and Confirm stack, for want of width. The
        write panel spans the tree, so it puts them on one line — for a
        number and for a list of states alike."""
        css = (await client.get("/static/css/hmi.css")).text
        rule = re.search(
            r"\.register-write-inner \.preset-custom,\s*"
            r"\.register-write-inner \.waveform-select\s*\{([^}]*)\}",
            css,
        )
        assert rule, "nothing lays the write panel's controls out differently"
        assert "flex-direction: row" in rule.group(1)


class TestRegisterUnitsComeFromTheDevice:
    """Asked once at start-up, before anything subscribes, so the first paint
    of the tree already carries each record's EGU."""

    T_OUT = "L4-OPCPA-NL2:PS1225:11:T_out"

    async def test_the_first_paint_shows_the_unit_the_record_reports(self):
        from core.epics.types import PvDescription
        from core.server import create_app
        from core.settings import Settings

        app = create_app(
            Settings(
                zone_code="TESTZ",
                epics_backend="sim",
                sim_tick_seconds=10,
                log_level="WARNING",
                dev=True,
                session_secret="test-only-secret",
            )
        )
        simulated = app.hmi.hub.describe

        async def kelvin(pv):
            # The zone file says °C; the record says K. The record wins.
            answer = await simulated(pv)
            if pv.name == self.T_OUT:
                return PvDescription(units="K")
            return answer

        app.hmi.hub.describe = kelvin
        async with app.test_app() as running:
            client = running.test_client()
            await client.post("/login", form={"username": "test", "password": "test"})
            page = (await (await client.get("/l4-opcpa/NL2/registers")).get_data()).decode()
        row = page[page.index('id="NL2-registers-r0-0"') :][:300]
        assert " K" in row or ">K<" in row, f"not the record's unit: {row!r}"
        assert "°C" not in row, f"the zone file's unit: {row!r}"


class TestAnIntegerRegistersField:
    """An `int` register's field takes whole numbers: no decimal point and no
    exponent can be typed, Confirm stays dead for anything else, and the
    endpoint refuses what reaches it another way."""

    PV = "L4-OPCPA-NL2:PS1225:11:PumpSpeed"

    @staticmethod
    def tag(markup: str, cls: str) -> str:
        start = markup.rindex("<", 0, markup.index(f'class="{cls}"'))
        return markup[start : _tag_end(markup, start)]

    async def panel(self, client) -> str:
        body = (
            await client.get(
                "/api/register", params={"component": "NL2-registers", "pv": self.PV}
            )
        ).text
        return body[body.index("register-write-inner") :]

    async def test_the_keypad_has_no_decimal_point(self, client):
        field = self.tag(await self.panel(client), "preset-field")
        assert 'inputmode="numeric"' in field, field

    async def test_a_decimal_point_or_exponent_cannot_be_typed(self, client):
        field = self.tag(await self.panel(client), "preset-field")
        typeable = TestAFieldTakesOnlyWhatItsKindAllows.accepts(field)
        assert typeable("1500")
        assert not typeable("1500.") and not typeable("15e"), field

    async def test_confirm_is_dead_for_anything_but_a_whole_number(self, client):
        confirm = self.tag(await self.panel(client), "preset-confirm")
        assert "[0-9]" in confirm and "isNaN" not in confirm, confirm

    async def test_its_range_is_written_in_whole_numbers(self, client):
        """DRVL/DRVH arrive as floats; an integer field saying 0.0..3000.0
        offers a decimal point it will not let anyone type."""
        assert "out of range (0..3000)" in await self.panel(client)

    async def test_the_endpoint_refuses_a_decimal(self, client):
        await self.panel(client)
        answer = await write(client, params={"pv": f"{self.PV}:W", "value": "2.5"}, json={}
        )
        assert "Refused" in answer.text and "whole number" in answer.text, answer.text


def input_tag(page: str, marker: str) -> str:
    """The whole `<input …>` tag carrying `marker`, attributes and all."""
    start = page.rindex("<input", 0, page.index(marker))
    return page[start : _tag_end(page, start)]


def _tag_end(markup: str, start: int) -> int:
    """End of the tag opened at `start`, skipping `>` inside quoted values —
    an expression like `Number($v) > 10` lives in an attribute."""
    quote = None
    for index in range(start, len(markup)):
        char = markup[index]
        if quote:
            if char == quote:
                quote = None
        elif char in ("'", '"'):
            quote = char
        elif char == ">":
            return index + 1
    return len(markup)


class TestAFieldTakesOnlyWhatItsKindAllows:
    """A setpoint field is text, so a half-typed `21.` survives (see
    `TestEverySetpointFieldSurvivesBeingTyped`) — and so the browser no longer
    filters what is typed, which `type="number"` used to. The field does it
    instead, by its kind: an integer takes digits and a sign, a number takes a
    decimal point as well. Checked on what would be inserted — a keystroke or
    a paste — against the text it would leave, so a value can always be on
    its way to being valid but never contain something that cannot be.
    """

    REGISTER = "L4-OPCPA-NL2:PS1225:11:"

    async def delay(self, client) -> str:
        page = (await client.get("/l4-opcpa")).text
        return input_tag(page, 'aria-label="Set Trigger Delay custom value"')

    async def register(self, client, name: str) -> str:
        body = (
            await client.get(
                "/api/register",
                params={"component": "NL2-registers", "pv": self.REGISTER + name},
            )
        ).text
        return input_tag(body, 'class="preset-field"')

    @staticmethod
    def accepts(field: str):
        """The pattern the field holds what it would leave to, as a test."""
        import html

        attribute = re.search(r'data-on:beforeinput="([^"]*)"', field)
        assert attribute, f"nothing filters what is typed: {field}"
        pattern = re.search(r"/(\^.*?\$)/\.test", html.unescape(attribute.group(1)))
        assert pattern, attribute.group(1)
        return lambda text: re.fullmatch(pattern.group(1), text) is not None

    async def attenuator(self, client) -> str:
        page = (await client.get("/l4-opcpa")).text
        return input_tag(page, 'aria-label="Set Attenuator"')

    async def test_each_field_says_which_kind_it_is(self, client):
        assert 'data-kind="integer"' in await self.delay(client)
        assert 'data-kind="integer"' in await self.attenuator(client)
        assert 'data-kind="number"' in await self.register(client, "SetPoint")
        assert 'data-kind="integer"' in await self.register(client, "PumpSpeed")

    async def test_an_integer_field_takes_digits_and_a_sign(self, client):
        for field in (
            await self.delay(client),
            await self.attenuator(client),
            await self.register(client, "PumpSpeed"),
        ):
            ok = self.accepts(field)
            for text in ("", "-", "+", "12", "-12"):
                assert ok(text), f"{text!r} cannot be typed"
            for text in ("1a", "a", "1.", "1e", "1!", "1 2", "--1", "1-"):
                assert not ok(text), f"{text!r} can be typed"

    async def test_a_number_field_takes_a_decimal_point_as_well(self, client):
        ok = self.accepts(await self.register(client, "SetPoint"))
        for text in ("", "-", "21", "21.", ".5", "-21.5"):
            assert ok(text), f"{text!r} cannot be typed"
        for text in ("21a", "x", "21.5.", "1e3", "2,5", "21 ", "#"):
            assert not ok(text), f"{text!r} can be typed"

    async def test_typing_and_pasting_into_the_real_field(self, client):
        """The expression itself, run against simulated input: keystrokes in
        sequence, then a paste into the middle of what is there."""
        import html
        import json
        import shutil
        import subprocess

        node = shutil.which("node")
        if node is None:
            pytest.skip("no node here to run the field's own JavaScript")
        field = await self.delay(client)
        expression = html.unescape(re.search(r'data-on:beforeinput="([^"]*)"', field).group(1))
        script = """
const expr = %s;
const run = new Function('el', 'evt', expr);
function insert(el, data) {
  let prevented = false;
  run(el, {data, preventDefault() { prevented = true; }});
  if (prevented) return;
  el.value = el.value.slice(0, el.selectionStart) + data + el.value.slice(el.selectionEnd);
  el.selectionStart = el.selectionEnd = el.selectionStart + data.length;
}
const typed = {value: '', selectionStart: 0, selectionEnd: 0};
for (const key of '5a0.e!0') insert(typed, key);
const pasted = {value: '500', selectionStart: 1, selectionEnd: 1};
insert(pasted, '7x');
insert(pasted, '7');
console.log(JSON.stringify([typed.value, pasted.value]));
""" % json.dumps(expression)
        out = subprocess.run([node, "-e", script], capture_output=True, text=True, timeout=10)
        assert out.returncode == 0, out.stderr
        assert json.loads(out.stdout) == ["500", "5700"], out.stdout


class TestMonitor:
    """`/monitor`: the one screen that is not a zone folder. It answers the
    first questions asked when a station misbehaves — who is connected, which
    screens are open, which monitors are dead, what the log said."""

    async def test_a_signed_in_user_gets_the_dashboard(self, client):
        response = await client.get("/monitor")
        assert response.status_code == 200
        assert "<title>Monitor — zone TESTZ</title>" in response.text
        assert ">TESTZ<" in response.text

    async def test_it_is_behind_the_sign_in_like_every_screen(self, anonymous):
        response = await anonymous.get("/monitor", follow_redirects=False)
        assert response.status_code == 307
        assert response.headers["location"] == "/login?next=/monitor"

    async def test_every_screen_links_to_it_without_joining_the_zone_menu(self, client):
        """A tool, not a screen: the zone menu stays the folder listing."""
        for slug in ("l4-opcpa", "chillers", "vacuum"):
            body = (await client.get(f"/{slug}")).text
            assert '<a class="nav-tool" href="/monitor">Monitor</a>' in body, slug
        body = (await client.get("/monitor")).text
        assert '<a class="nav-tool" href="/monitor" aria-current="page">Monitor</a>' in body
        assert re.findall(r'class="nav-link"[^>]*>([^<]+)', body) == [
            "L4 OPCPA",
            "Chillers",
            "Vacuum",
            "Cameras",
        ]

    @staticmethod
    def rows(body: str, panel: str) -> list[list[str]]:
        """The body rows of one dashboard panel, each a list of cell texts."""
        section = re.search(rf'id="{panel}".*?</section>', body, re.S)
        assert section, f"no #{panel} on the page"
        return [
            [
                " ".join(re.sub(r"<[^>]+>", " ", cell).split())
                for cell in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
            ]
            for row in re.findall(r"<tr[^>]*>(.*?)</tr>", section.group(0), re.S)
            if "<td" in row
        ]

    async def test_an_open_screen_is_listed_with_who_and_where_until_it_closes(self, client):
        agent = "monitor-test/1.0"
        mine = lambda rows: [row for row in rows if "monitor-test 1.0" in row]  # noqa: E731

        async with client.stream(
            "GET", "/chillers/stream", headers={"user-agent": agent}
        ) as stream:
            # Held, not discarded: a dropped iterator is finalised, and that
            # closes the connection — the stream would be gone before we look.
            chunks = stream.aiter_text()
            await anext(chunks)  # the stream is registered by now
            rows = mine(self.rows((await client.get("/monitor")).text, "mon-clients"))
            assert len(rows) == 1, rows
            assert rows[0][:2] == ["test", "127.0.0.1"]
            assert rows[0][3] == "chillers"

        # Closing the tab ends the stream on the server side shortly after.
        for _ in range(50):
            if not mine(self.rows((await client.get("/monitor")).text, "mon-clients")):
                break
            await asyncio.sleep(0.1)
        else:
            pytest.fail("a closed stream is still listed as a client")

    async def test_every_screen_is_listed_with_its_size_and_who_has_it_open(self, client):
        stats = (await client.get("/stats")).json()["screens"]
        async with client.stream("GET", "/vacuum/stream") as stream:
            chunks = stream.aiter_text()
            await anext(chunks)
            rows = {row[0]: row for row in self.rows((await client.get("/monitor")).text, "mon-screens")}

        assert list(rows) == ["l4-opcpa", "chillers", "vacuum", "cameras"]
        for slug, row in rows.items():
            title, streams, users, components, widgets, pvs = row[1:]
            assert title == stats[slug]["title"]
            assert (components, widgets, pvs) == tuple(
                str(stats[slug][key]) for key in ("components", "widgets", "pvs")
            )
        assert int(rows["vacuum"][2]) >= 1
        assert "test" in rows["vacuum"][3]

    async def test_every_open_ca_monitor_is_listed_with_its_traffic(self, client):
        """One row per (PV, datatype) the hub monitors — the number `/stats`
        reports — and the simulator has sent each its first value by now."""
        stats = (await client.get("/stats")).json()
        rows = self.rows((await client.get("/monitor")).text, "mon-monitors")
        assert len(rows) == stats["monitored_pvs"]
        pv, datatype, refs, state, value, updates, last, error = rows[0]
        assert int(refs) >= 1
        assert all(int(row[5]) >= 1 for row in rows), "a monitor with no update yet"

    @staticmethod
    def log_lines(body: str) -> list[str]:
        section = re.search(r'<section[^>]*id="mon-log".*?</section>', body, re.S)
        assert section, "no #mon-log on the page"
        return re.findall(r'<li class="log-line".*?</li>', section.group(0), re.S)

    async def test_the_log_shows_a_warning_with_its_details_picked_out(self, client):
        await client.post("/api/write", params={"pv": "bad name", "value": "1"})
        lines = self.log_lines((await client.get("/monitor")).text)
        [line] = [line for line in lines if "bad name" in line][:1]
        assert 'data-level="WARNING"' in line
        assert 'data-cat="writes"' in line
        assert 'data-tone="warning"' in line
        assert '<span class="k">user</span>=<span class="v">test</span>' in line
        assert lines.index(line) == min(
            i for i, other in enumerate(lines) if "write refused" in other
        ), "newest first"

    async def test_what_a_request_put_in_the_log_cannot_put_markup_on_the_page(self, client):
        await client.post("/api/write", params={"pv": "<script>alert(1)</script>"})
        section = "".join(self.log_lines((await client.get("/monitor")).text))
        assert "&lt;script&gt;" in section
        assert "<script>alert" not in section

    async def test_the_overview_says_what_this_process_is(self, client):
        stats = (await client.get("/stats")).json()
        overview = re.search(
            r'id="mon-overview".*?</section>', (await client.get("/monitor")).text, re.S
        ).group(0)
        facts = dict(
            re.findall(r"<dt>([^<]+)</dt>\s*<dd[^>]*>(.*?)</dd>", overview, re.S)
        )
        assert facts["Zone"] == "TESTZ"
        assert facts["Backend"] == "simulated EPICS"
        assert facts["Sign-in"] == stats["auth"]
        assert re.fullmatch(r"\d+(s|m \d\ds|h \d\dm|d \d\dh)", facts["Up"])
        assert facts["PID"].isdigit()
        assert "positive-neutral" in facts["EPICS link"]

    async def test_its_stream_opens_with_a_full_sync(self, client):
        events = await read_events(client, "/monitor/stream", count=3)
        assert events[0].startswith("event: datastar-patch-signals")
        # The opening signals also carry this tab's view of the screen's
        # exclusive PVs (`_locks`), which the page could not know.
        assert '"_age":0' in events[0]
        assert events[1].startswith("event: datastar-patch-elements")
        for panel in ("mon-overview", "mon-clients", "mon-screens", "mon-monitors"):
            assert f'id="{panel}"' in events[1], panel
        assert "selector #log-lines" in events[2] and "mode inner" in events[2]

    async def test_a_new_log_line_reaches_an_open_dashboard_on_top(self, client):
        events: list[str] = []
        task = asyncio.create_task(
            read_events(client, "/monitor/stream", count=500, timeout=8, into=events)
        )
        await asyncio.sleep(0.6)  # past the opening sync
        await client.post("/api/write", params={"pv": "live tail check"})
        try:
            for _ in range(40):
                arrived = [e for e in events[3:] if "live tail check" in e]
                if arrived:
                    break
                await asyncio.sleep(0.1)
            else:
                pytest.fail("the new log line never reached the open dashboard")
        finally:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        assert "mode prepend" in arrived[0] and "selector #log-lines" in arrived[0]

    async def test_the_whole_log_downloads_as_text_for_a_ticket(self, client):
        await client.post("/api/write", params={"pv": "for the ticket"})
        response = await client.get("/monitor/logs.txt")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/plain")
        assert re.fullmatch(
            r'attachment; filename="eli-hmi-TESTZ-\d{8}-\d{4}\.txt"',
            response.headers["content-disposition"],
        )
        assert re.search(r"WARNING +core\.routes: write refused user=test pv='for the ticket'", response.text)

    async def test_the_long_lists_each_open_to_the_full_screen(self, client):
        """The cameras, the PV list and the log are short by default so the
        page reads at a glance; each expands to the whole window when it is
        the thing to study, and Escape puts it back."""
        body = (await client.get("/monitor")).text
        declared = re.search(r'data-signals="(\{[^"]*\})"', body.split('class="page monitor"')[1])
        panels = (("_camfull", "Cameras"), ("_pvfull", "CA monitors"), ("_logfull", "Log"))
        for signal, panel in panels:
            assert f"{signal}: false" in declared.group(1)
            section = re.search(rf'<section[^>]*aria-label="{panel}"[^>]*>', body).group(0)
            assert f"'mon-full': ${signal}" in section, panel
            assert f'data-on:click="${signal} = !${signal}"' in body, panel
        assert "evt.key === 'Escape' && ($_camfull = false, $_pvfull = false, $_logfull = false)" in body

    async def test_the_camera_list_is_as_short_as_the_others(self, client):
        """The camera table scrolls inside the same box as the PV list."""
        body = (await client.get("/monitor")).text
        section = body[body.index('aria-label="Cameras"'):body.index('aria-label="CA monitors"')]
        scroll = section.index('class="mon-scroll"')
        assert scroll < section.index('id="mon-cameras"')



# ---------------------------------------------------------------------------
# Exclusive write control
# ---------------------------------------------------------------------------

#: VV1 is `exclusive: true` on the Vacuum screen; VV2 beside it is not.
VV1_OPEN = "L4-VCS-NL2:VV1:Open"
VV2_OPEN = "L4-VCS-NL2:VV2:Open"
#: What the browser sends with every request: the Datastar header, and the
#: signals — of which only `tab` matters here.
DATASTAR = {"Datastar-Request": "true"}


async def lock(client, tab: str | None, action: str, pv: str = VV1_OPEN):
    return await client.post(
        "/api/lock",
        params={"pv": pv, "action": action, "status": "vv1-open-status"},
        json={"tab": tab},
        headers=DATASTAR,
    )


async def press(client, tab: str | None, pv: str = VV1_OPEN, value: int = 1):
    return await client.post("/api/write", params={"pv": pv, "value": value}, json={"tab": tab}, headers=DATASTAR
    )


def stream_as(slug: str, tab: str) -> str:
    """A screen's stream, opened the way a browser tab with this id opens it."""
    return f"/{slug}/stream?" + urlencode({"datastar": json.dumps({"tab": tab})})


async def until(check, timeout: float = 5.0) -> None:
    """Wait for `check()` — sync or async — to be true."""
    deadline = asyncio.get_running_loop().time() + timeout
    while True:
        result = check()
        if asyncio.iscoroutine(result):
            result = await result
        if result:
            return
        if asyncio.get_running_loop().time() > deadline:
            pytest.fail("timed out waiting for the condition")
        await asyncio.sleep(0.05)


class TestExclusiveControl:
    """One tab at a time may write an exclusive PV. Every route to the device
    is checked at the endpoint, and every open screen hears the lock move."""

    @pytest.fixture(autouse=True)
    async def free_valve(self, client):
        # The server is shared by the module, so every test starts — and
        # leaves — with nobody holding VV1.
        await lock(client, "janitor", "force")
        await lock(client, "janitor", "release")
        yield
        await lock(client, "janitor", "force")
        await lock(client, "janitor", "release")

    async def test_a_write_nobody_took_control_for_is_refused(self, client):
        response = await press(client, "tab-a")
        assert "Refused" in response.text
        assert "take control" in response.text

    async def test_the_tab_that_took_control_may_write_and_no_other_may(self, client):
        taken = await lock(client, "tab-a", "take")
        assert '"state":"mine"' in taken.text

        assert "Refused" not in (await press(client, "tab-a")).text
        refused = (await press(client, "tab-b")).text
        assert "Refused" in refused
        assert "controlled by test at 127.0.0.1" in refused

    async def test_a_request_that_names_no_tab_is_refused(self, client):
        """A curl, or a page from before the feature: it is not the holder."""
        await lock(client, "tab-a", "take")
        response = await client.post("/api/write", params={"pv": VV1_OPEN, "value": 1})
        assert "Refused" in response.text

    async def test_a_second_tab_is_told_who_has_it_and_may_force_it(self, client):
        await lock(client, "tab-a", "take")

        refused = await lock(client, "tab-b", "take")
        assert "controlled by test" in refused.text

        forced = await lock(client, "tab-b", "force")
        assert '"state":"mine"' in forced.text
        assert "Refused" not in (await press(client, "tab-b")).text
        assert "Refused" in (await press(client, "tab-a")).text

    async def test_release_hands_it_back(self, client):
        await lock(client, "tab-a", "take")
        released = await lock(client, "tab-a", "release")
        assert '"state":"free"' in released.text
        assert '"state":"mine"' in (await lock(client, "tab-b", "take")).text

    async def test_a_pv_that_is_not_exclusive_is_written_from_anywhere(self, client):
        response = await client.post("/api/write", params={"pv": VV2_OPEN, "value": 1})
        assert "Refused" not in response.text

    async def test_an_action_that_is_not_one_is_refused(self, client):
        response = await lock(client, "tab-a", "steal")
        assert "Refused" in response.text

    async def test_a_tab_that_holds_control_is_unlocked_by_its_stream(self, client):
        """The page renders locked — it cannot know which tab is asking — and
        the stream's first events say what this tab holds."""
        await lock(client, "tab-a", "take")
        events = await read_events(client, stream_as("vacuum", "tab-a"), 3, headers=DATASTAR)
        assert any('"state":"mine"' in event for event in events)

    async def test_every_screen_hears_the_lock_move(self, client):
        """The listening screen opens while tab-a holds VV1: opened on a free
        one, it would take VV1 itself (`TestTheFirstTabToOpenAScreenHasControl`).
        VV1's own entry is followed, since the screen has other locks."""
        page = (await client.get("/vacuum")).text
        button = page[page.index(quote(VV1_OPEN, safe="")) - 400 : page.index(quote(VV1_OPEN, safe=""))]
        key = re.findall(r"\$_locks\.(\w+)\.state", button)[-1]
        vv1 = f'"{key}":{{"state":'
        await lock(client, "tab-a", "take")
        events: list[str] = []
        watching = asyncio.create_task(
            read_events(client, stream_as("vacuum", "tab-b"), 1000, timeout=8,
                        into=events, headers=DATASTAR)
        )
        try:
            await until(lambda: any(vv1 + '"other"' in e for e in events))
            await lock(client, "tab-a", "release")
            await until(lambda: any(vv1 + '"free"' in e for e in events))
            freed = next(i for i, e in enumerate(events) if vv1 + '"free"' in e)
            await lock(client, "tab-c", "take")
            await until(lambda: any(vv1 + '"other"' in e and "since" in e for e in events[freed:]))
        finally:
            watching.cancel()

    async def test_the_holder_forced_out_is_told_by_whom(self, client):
        events: list[str] = []
        watching = asyncio.create_task(
            read_events(client, stream_as("vacuum", "tab-a"), 1000, timeout=8,
                        into=events, headers=DATASTAR)
        )
        try:
            await until(lambda: len(events) >= 2)
            await lock(client, "tab-a", "take")
            await until(lambda: any('"state":"mine"' in e for e in events))
            await lock(client, "tab-b", "force")
            await until(lambda: any("taken over by test" in e for e in events))
        finally:
            watching.cancel()

    async def test_the_monitor_lists_who_holds_what(self, client):
        await lock(client, "tab-a", "take")
        rows = TestMonitor.rows((await client.get("/monitor")).text, "mon-locks")
        # A row per unit, naming the device and every PV it covers.
        assert any(
            "VV1 gate valve" in row and "test" in row and any(VV1_OPEN in cell for cell in row)
            for row in rows
        ), rows


@pytest.fixture(scope="module")
def short_grace():
    with running(lock_grace_seconds=0.3) as url:
        yield url


async def test_a_lock_whose_tab_is_gone_lapses(short_grace):
    import httpx

    async with httpx.AsyncClient(base_url=short_grace, timeout=15) as client:
        await client.post("/login", data={"username": "test", "password": "test"})
        # Taken with no screen open in that tab: nothing keeps it alive.
        assert '"state":"mine"' in (await lock(client, "tab-a", "take")).text

        async def free() -> bool:
            return '"state":"mine"' in (await lock(client, "tab-b", "take")).text

        await until(free, timeout=5)


async def test_a_control_whose_holder_left_passes_to_the_tab_still_showing_it(short_grace):
    """Two desks on the vacuum screen. The first to open it has VV1; when it
    closes, the other desk has VV1 once the grace period is over, and is told
    so on its own screen."""
    import httpx

    async with httpx.AsyncClient(base_url=short_grace, timeout=15) as client:
        await client.post("/login", data={"username": "test", "password": "test"})
        # VV1's own entry: the screen has other units (its motors), and the
        # server is shared by the module, so VV1 starts free.
        page = (await client.get("/vacuum")).text
        button = page[: page.index(quote(VV1_OPEN, safe=""))]
        vv1 = re.findall(r"\$_locks\.(\w+)\.state", button)[-1]
        await lock(client, "janitor", "force")
        await lock(client, "janitor", "release")
        first: list[str] = []
        second: list[str] = []
        desk_a = asyncio.create_task(
            read_events(client, stream_as("vacuum", "tab-a"), 1000, timeout=10,
                        into=first, headers=DATASTAR)
        )
        await until(lambda: any(f'"{vv1}":{{"state":"mine"' in e for e in first))
        desk_b = asyncio.create_task(
            read_events(client, stream_as("vacuum", "tab-b"), 1000, timeout=10,
                        into=second, headers=DATASTAR)
        )
        try:
            await until(lambda: any(f'"{vv1}":{{"state":"other"' in e for e in second))
            desk_a.cancel()
            # Named as the screen names it: the unit is the valve.
            await until(lambda: any("VV1 gate valve passed to you" in e for e in second), timeout=6)
            assert "Refused" not in (await press(client, "tab-b")).text
        finally:
            desk_a.cancel()
            desk_b.cancel()
