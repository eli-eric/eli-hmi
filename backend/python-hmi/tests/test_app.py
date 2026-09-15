"""End-to-end: the page, the SSE stream, and the write path against a live
server. Uses a real uvicorn socket because the point is the streaming response,
and an in-process ASGI transport buffers it.
"""

from __future__ import annotations

import asyncio
import re
import socket
import threading

import pytest
import uvicorn

from app.main import create_app
from app.settings import Settings


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.fixture(scope="module")
def server():
    port = free_port()
    app = create_app(
        Settings(
            zone_code="test",
            epics_backend="sim",
            sim_tick_seconds=0.2,
            render_interval=0.05,
            heartbeat_seconds=0.5,
            log_level="WARNING",
        )
    )
    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    for _ in range(100):
        if server.started:
            break
        threading.Event().wait(0.1)
    else:  # pragma: no cover
        pytest.fail("server did not start")
    yield f"http://127.0.0.1:{port}"
    server.should_exit = True
    thread.join(timeout=10)


@pytest.fixture
async def client(server):
    import httpx

    async with httpx.AsyncClient(base_url=server, timeout=15) as client:
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
    async def test_renders_with_real_values_not_placeholders(self, client):
        """The prewarmed cache is what makes server-side rendering worth
        anything: a control-room page that renders `<>` and fills in after a
        round-trip reads as "the system is down" for the second it takes."""
        response = await client.get("/l4-opcpa")
        assert response.status_code == 200
        body = response.text
        assert "L4 OPCPA" in body
        assert 'id="w-NL2-overview"' in body
        # CONN is seeded true, so it must already read YES in the HTML itself.
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

    async def test_index_redirects_to_the_page(self, client):
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
        assert 'id="w-NL2-overview"' in events[1]
        assert 'id="w-NL2-chiller_0_flow"' in events[1]

    async def test_later_patches_carry_only_what_changed(self, client):
        events = await read_events(client, "/l4-opcpa/stream", count=8)
        element_events = [e for e in events if "patch-elements" in e][1:]
        assert element_events, "expected incremental patches"
        # The drifting analogue readouts move; the shutter does not flap.
        patched = set()
        for event in element_events:
            patched.update(re.findall(r'id="(w-[^"]+)"', event))
        assert patched
        assert "w-NL2-shutter" not in patched

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
        assert stats["lasers"] == ["NL2"]
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
