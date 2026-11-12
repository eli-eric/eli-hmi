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
import json
import re
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


class TestWrite:
    async def test_a_direct_write_reaches_the_pv_and_the_page(self, client):
        shutter = "L4-OPCPA-NL2:IO:15:RC1_pin31"
        events: list[str] = []

        async def watch():
            await read_events(client, "/l4-opcpa/stream", count=30, timeout=6, into=events)

        task = asyncio.create_task(watch())
        await asyncio.sleep(0.6)
        response = await client.post("/api/write", params={"pv": shutter, "value": "1"}, json={})
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
        # Start is exclusive on this screen, so the tab takes control first.
        start = "CMD_NL2_START_LASER"
        await lock(client, "tab-a", "take", pv=start)
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
        response = await client.post(
            "/api/write",
            params={"pv": "L4-OPCPA-NL2:PS5059:22:SetBothChannelsTrigDelay", "signal": "NL2_delay_value"},
            json={"NL2_delay_value": "500"},
            headers={"Datastar-Request": "true"},
        )
        assert response.status_code == 200
        assert "500" in response.text

    async def test_an_empty_field_is_refused_rather_than_written(self, client):
        response = await client.post(
            "/api/write",
            params={"pv": "L4-OPCPA-NL2:ATT", "signal": "NL2_atten_value"},
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
        return await client.post(
            "/api/write",
            params={"pv": pv, "signal": "v"},
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
        # The binding that carries a range — the delay's Confirm. Other
        # controls on the screen bind `disabled` too (an exclusive button
        # waits for this tab to take control), and say nothing about range.
        binding = re.search(r'data-attr="\{disabled:[^"]*Number\([^"]*"', page)
        assert binding, "Confirm has no disabled binding"
        assert "60000" in binding.group() and "10" in binding.group()

    async def test_digits_the_device_cannot_resolve_are_dropped(self, client):
        """Truncated, never rounded: 500.7 is 500. An operator watching a value
        they did not type reach the machine is worse than a refused keystroke,
        and rounding invents one."""
        response = await self._set(client, self.DELAY, "500.7")
        assert "Refused" not in response.text
        assert "500" in response.text and "500.7" not in response.text

    async def test_a_request_with_no_value_at_all_is_refused(self, client):
        # Falling through used to write the string "None" to the device.
        response = await client.post("/api/write", params={"pv": "L4-OPCPA-NL2:ATT"}, json={})
        assert "Refused" in response.text
        assert "None" not in response.text

    async def test_nan_and_infinity_are_not_values_an_operator_typed(self, client):
        for text in ("nan", "infinity", "1_000"):
            response = await client.post(
                "/api/write", params={"pv": "L4-OPCPA-NL2:SI_TEST", "value": text}, json={}
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
        rule = css[css.index(".waveform-select {") :][: css[css.index(".waveform-select {") :].index("}")]
        assert "column" in rule


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

    async def test_an_integer_field_drops_the_decimals_too(self, client):
        """The delay resolves whole nanoseconds, so 500.7 is sent as 500 — the
        field has to say so before the press, not after."""
        page = (await client.get("/l4-opcpa")).text
        field = page[page.index('aria-label="Set Trigger Delay custom value"') - 800 :][:800]
        assert "data-on:blur" in field
        assert "{0,0}" in field

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
        return await client.post(
            "/api/write",
            params={"pv": self.DELAY, "signal": "v", "status": "s"},
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
        live = page.count("waveforms_available}")
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
        return await self.client.post(
            "/api/write",
            params={
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

    async def test_the_pv_list_and_the_log_each_open_to_the_full_screen(self, client):
        """Both lists are short by default so the page reads at a glance; each
        expands to the whole window when one of them is the thing to study,
        and Escape puts it back."""
        body = (await client.get("/monitor")).text
        declared = re.search(r'data-signals="(\{[^"]*\})"', body.split('class="page monitor"')[1])
        for signal, panel in (("_pvfull", "CA monitors"), ("_logfull", "Log")):
            assert f"{signal}: false" in declared.group(1)
            section = re.search(rf'<section[^>]*aria-label="{panel}"[^>]*>', body).group(0)
            assert f"'mon-full': ${signal}" in section, panel
            assert f'data-on:click="${signal} = !${signal}"' in body, panel
        assert "evt.key === 'Escape' && ($_pvfull = false, $_logfull = false)" in body



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
    return await client.post(
        "/api/write", params={"pv": pv, "value": value}, json={"tab": tab}, headers=DATASTAR
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
        events: list[str] = []
        watching = asyncio.create_task(
            read_events(client, stream_as("vacuum", "tab-b"), 1000, timeout=8,
                        into=events, headers=DATASTAR)
        )
        try:
            await until(lambda: len(events) >= 2)
            await lock(client, "tab-a", "take")
            await until(lambda: any('"state":"other"' in e and "since" in e for e in events))
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
        assert any(VV1_OPEN in row and "test" in row for row in rows), rows


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
