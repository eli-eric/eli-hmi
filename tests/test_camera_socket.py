"""End-to-end: the camera WebSocket against a live server.

A real Hypercorn socket and a real WebSocket client, for the same reason as
`test_app.py`: the thing under test is a long-lived stream, and backpressure
and shutdown only exist on a real connection.
"""

from __future__ import annotations

import asyncio
import io
import json

import pytest
from PIL import Image
from websockets.asyncio.client import connect
from websockets.exceptions import InvalidStatus

from cameras.protocol import SOCKET_PATH, unpack_frame
from core.auth import COOKIE_NAME
from tests.test_app import client, server  # noqa: F401  (fixtures)

#: On the TESTZ cameras screen, 1024x1024.
CAMERA = "TESTZ-CAM:NL1-NF:Image"


def socket_url(server: str) -> str:
    return server.replace("http://", "ws://") + SOCKET_PATH


def session_headers(client) -> dict[str, str]:
    return {"Cookie": f"{COOKIE_NAME}={client.cookies[COOKIE_NAME]}"}


async def receive_json(ws) -> dict:
    message = await asyncio.wait_for(ws.recv(), timeout=5)
    assert isinstance(message, str), "expected a text message"
    return json.loads(message)


async def receive_frame(ws):
    while True:
        message = await asyncio.wait_for(ws.recv(), timeout=5)
        if isinstance(message, bytes):
            return unpack_frame(message)


class TestGate:
    async def test_a_socket_without_a_session_is_refused(self, server):
        with pytest.raises(InvalidStatus) as refused:
            async with connect(socket_url(server)):
                pass
        assert refused.value.response.status_code == 401


class TestHello:
    async def test_it_tells_the_page_how_each_status_looks(self, server, client):
        """The page applies tones; it never decides them (`camera_tone`)."""
        async with connect(socket_url(server), additional_headers=session_headers(client)) as ws:
            hello = (await receive_json(ws))["hello"]

        assert hello["status"]["0"] == {"text": "", "tone": None}
        assert hello["status"]["1"] == {"text": "SATURATED", "tone": "warning"}
        assert hello["status"]["3"]["tone"] == "invalid"
        # What the page shows on its own when frames stop arriving.
        assert hello["stale"]["tone"] == "unknown"


class TestFrames:
    async def test_a_viewer_gets_frames_of_the_camera_it_asked_for(self, server, client):
        async with connect(socket_url(server), additional_headers=session_headers(client)) as ws:
            hello = (await receive_json(ws))["hello"]
            assert CAMERA in hello["cameras"]

            await ws.send(json.dumps({"view": {CAMERA: {"px": 256, "fps": 10}}}))
            header, payload = await receive_frame(ws)

        assert hello["cameras"][header.camera] == CAMERA
        assert (header.width, header.height) == (256, 256)
        image = Image.open(io.BytesIO(payload))
        assert image.format == "JPEG"
        assert image.size == (256, 256)


class TestFocus:
    async def test_a_focus_view_gets_full_resolution_16_bit_frames(self, server, client):
        from cameras.encode import decode_lossless
        from cameras.protocol import Encoding

        async with connect(
            socket_url(server), additional_headers=session_headers(client), max_size=None
        ) as ws:
            await receive_json(ws)
            await ws.send(json.dumps({"view": {CAMERA: {"px": 1600, "fps": 10, "lossless": True}}}))
            header, payload = await receive_frame(ws)

        assert (header.factor, header.encoding) == (1, Encoding.LOSSLESS16)
        pixels = decode_lossless(payload, header.width, header.height)
        assert pixels.shape == (1024, 1024)
        assert pixels.max() == header.max_value


class TestView:
    def test_a_view_message_can_ask_for_lossless_frames(self):
        from cameras.routes import parse_view

        view = parse_view(json.dumps({"view": {CAMERA: {"px": 1024, "fps": 10, "lossless": True}}}))
        assert view[CAMERA].lossless is True
        assert parse_view(json.dumps({"view": {CAMERA: {"px": 64, "fps": 2}}}))[CAMERA].lossless is False
