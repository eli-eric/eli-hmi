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
import re
import socket
import threading

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
    settings = Settings(
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
    client, path: str, count: int, timeout: float = 10.0, into: list[str] | None = None
) -> list[str]:
    """Collect `count` SSE events (blank-line separated) from a stream.

    `into` lets a caller keep what arrived when the read is cancelled rather
    than waiting for the full count — the tests that watch a stream while
    writing to a PV need exactly that.
    """
    events: list[str] = into if into is not None else []

    async def reader():
        async with client.stream("GET", path) as response:
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
        for slug in ("l4-opcpa", "chillers", "vacuum"):
            response = await client.get(f"/{slug}")
            assert response.status_code == 200, slug

    async def test_the_menu_is_the_same_on_every_screen(self, client):
        menus = []
        for slug in ("l4-opcpa", "chillers", "vacuum"):
            body = (await client.get(f"/{slug}")).text
            menus.append(re.findall(r'class="nav-link"[^>]*>([^<]+)', body))
        assert menus[0] == menus[1] == menus[2]
        assert menus[0] == ["L4 OPCPA", "Chillers", "Vacuum"]

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

    async def test_index_redirects_to_the_zone_first_screen(self, client):
        response = await client.get("/", follow_redirects=False)
        assert response.status_code in (307, 308)
        assert response.headers["location"] == "/l4-opcpa"


class TestStream:
    async def test_opens_with_a_full_sync_then_patches(self, client):
        events = await read_events(client, "/l4-opcpa/stream", count=4)
        assert len(events) >= 4
        assert events[0].startswith("event: datastar-patch-signals")
        assert '{"_age":0}' in events[0]
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
        await client.post("/api/write", params={"pv": "CMD_NL2_START_LASER", "value": "1"}, json={})
        await asyncio.sleep(1.5)
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
        assert set(stats["screens"]) == {"l4-opcpa", "chillers", "vacuum"}
        assert stats["monitored_pvs"] > 0
        assert stats["link_ok"] is True


class TestWriteGuards:
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

    async def test_the_stream_is_refused_rather_than_redirected(self, anonymous):
        """A redirect to an HTML login page would have Datastar patch the form
        into the screen. 401 is the honest answer to machinery."""
        response = await anonymous.get("/l4-opcpa/stream", follow_redirects=False)
        assert response.status_code == 401
        assert response.json()["login"] == "/login"

    async def test_a_write_is_refused(self, anonymous):
        response = await anonymous.post(
            "/api/write",
            params={"pv": "L4-OPCPA-NL2:IO:15:RC1_pin31", "value": "1"},
            json={},
            headers={"Datastar-Request": "true"},
        )
        assert response.status_code == 401

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
