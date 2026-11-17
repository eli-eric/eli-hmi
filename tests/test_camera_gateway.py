"""The camera gateway as its own process (`python -m cameras`), and the checks
that make a socket safe to open from a browser.

Running the gateway apart from the HMI is what keeps a burst of camera traffic
from slowing a control write. The browser cannot tell the difference: it gets
the same cookie-protected socket on another port, and the HMI's own sign-in is
what lets it in.
"""

from __future__ import annotations

import asyncio
import json
import re
import threading
from contextlib import contextmanager

import httpx
import pytest
from websockets.asyncio.client import connect
from websockets.exceptions import InvalidStatus

from cameras.protocol import SOCKET_PATH, unpack_frame
from cameras.server import create_gateway_app
from core.auth import COOKIE_NAME
from core.server import serve_config
from core.settings import Settings
from tests.test_app import accepting, client, free_port, running, server  # noqa: F401

SECRET = "test-only-secret"
CAMERA = "TESTZ-CAM:NL1-FF:Image"


@contextmanager
def serving(app, settings: Settings, port: int):
    """Any app on a real Hypercorn socket, for as long as the block runs."""
    config = serve_config(settings)
    config.bind = [f"127.0.0.1:{port}"]
    config.accesslog = None
    stop = threading.Event()

    def run() -> None:
        from hypercorn.asyncio import serve

        async def shutdown() -> None:
            await asyncio.get_running_loop().run_in_executor(None, stop.wait)

        asyncio.run(serve(app, config, shutdown_trigger=shutdown))

    thread = threading.Thread(target=run, daemon=True)
    thread.start()
    if not accepting(port):  # pragma: no cover
        pytest.fail("gateway did not start")
    yield f"http://127.0.0.1:{port}"
    stop.set()
    thread.join(timeout=10)


@pytest.fixture(scope="module")
def gateway():
    """A standalone gateway on the TESTZ cameras, sharing the HMI's secret."""
    port = free_port()
    settings = Settings(
        zone_code="TESTZ", epics_backend="sim", log_level="WARNING",
        session_secret=SECRET, camera_port=port,
    )
    with serving(create_gateway_app(settings), settings, port) as url:
        yield url


def ws(url: str) -> str:
    return url.replace("http://", "ws://") + SOCKET_PATH


def cookie(client) -> dict[str, str]:
    return {"Cookie": f"{COOKIE_NAME}={client.cookies[COOKIE_NAME]}"}


class TestStandalone:
    async def test_it_lets_in_whoever_signed_in_to_the_hmi(self, gateway, client):
        async with connect(ws(gateway), additional_headers=cookie(client)) as socket:
            hello = json.loads(await socket.recv())["hello"]
            await socket.send(json.dumps({"view": {CAMERA: {"px": 128, "fps": 10}}}))
            message = await asyncio.wait_for(socket.recv(), timeout=5)

        header, _ = unpack_frame(message)
        assert hello["cameras"][header.camera] == CAMERA
        assert header.width == 128

    async def test_it_refuses_a_socket_without_a_session(self, gateway):
        with pytest.raises(InvalidStatus) as refused:
            async with connect(ws(gateway)):
                pass
        assert refused.value.response.status_code == 401

    async def test_its_stats_are_behind_the_same_sign_in(self, gateway, client):
        async with httpx.AsyncClient(base_url=gateway) as anonymous:
            assert (await anonymous.get("/api/cameras/stats")).status_code == 401
            signed_in = await anonymous.get("/api/cameras/stats", headers=cookie(client))
        assert signed_in.status_code == 200
        assert CAMERA in signed_in.json()["cameras"]

    async def test_it_answers_health_checks_without_a_session(self, gateway):
        async with httpx.AsyncClient(base_url=gateway) as anonymous:
            assert (await anonymous.get("/health/ready")).status_code == 200


class TestOrigin:
    """A page on another site could otherwise open a socket with the
    operator's cookie. The browser always says where a socket was opened from;
    it must be this host (any port — the gateway's port differs from the HMI's)."""

    async def test_a_socket_opened_from_another_host_is_refused(self, server, client):
        with pytest.raises(InvalidStatus) as refused:
            async with connect(ws(server), additional_headers=cookie(client), origin="http://elsewhere.example"):
                pass
        assert refused.value.response.status_code == 403

    async def test_a_page_on_another_port_of_this_host_is_let_in(self, gateway, client):
        async with connect(ws(gateway), additional_headers=cookie(client), origin="http://127.0.0.1:8082") as socket:
            assert "hello" in json.loads(await socket.recv())


class TestPagesPointAtTheGateway:
    async def test_with_a_gateway_url_the_page_connects_there_and_the_hmi_serves_no_frames(self):
        with running(camera_gateway="http://127.0.0.1:8083") as url:
            async with httpx.AsyncClient(base_url=url) as hmi:
                await hmi.post("/login", data={"username": "test", "password": "test"})
                body = (await hmi.get("/cameras")).text
                stats = await hmi.get("/api/cameras/stats")
        assert re.search(r'name="hmi-camera-socket" content="http://127\.0\.0\.1:8083/api/cameras/ws"', body)
        assert stats.status_code == 404


class TestMonitorReadsTheGateway:
    async def test_monitor_fetches_a_standalone_gateways_statistics(self, gateway):
        """`/monitor` is the HMI's page, so it has to ask the gateway: with a
        service cookie it signs itself, using the secret the two share."""
        from types import SimpleNamespace

        from core.auth import SessionCodec
        from core.monitor import camera_stats

        hmi = SimpleNamespace(
            cameras=None,
            settings=Settings(camera_gateway=gateway, session_secret=SECRET),
            sessions=SessionCodec(SECRET, hours=1),
        )
        stats = await camera_stats(hmi)
        assert CAMERA in stats["cameras"]

    async def test_an_unreachable_gateway_is_reported_not_raised(self):
        from types import SimpleNamespace

        from core.auth import SessionCodec
        from core.monitor import camera_stats

        hmi = SimpleNamespace(
            cameras=None,
            settings=Settings(camera_gateway=f"http://127.0.0.1:{free_port()}", session_secret=SECRET),
            sessions=SessionCodec(SECRET, hours=1),
        )
        stats = await camera_stats(hmi)
        assert "unreachable" in stats["error"]
