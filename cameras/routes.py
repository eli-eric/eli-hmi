"""The camera socket: one WebSocket per page, every camera on it.

Mounted in the HMI itself (`CAMERA_GATEWAY=embedded`) or in the standalone
gateway (`python -m cameras`). Either way the app carries `app.cameras`, a
`CameraService`, and requires a session before the socket opens (the
`before_websocket` gate in `core.login`).
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field

from quart import Blueprint, current_app, jsonify, websocket

from cameras.hub import CameraHub, Want
from cameras.protocol import SCALES, SOCKET_PATH, STATS_PATH, Status, pack_frame
from core.render.severity import CAMERA_STALE, CAMERA_STATUS_TEXT, camera_tone

logger = logging.getLogger(__name__)


@dataclass
class CameraService:
    """What the camera routes need, hung off the app as `app.cameras`."""

    hub: CameraHub
    #: Set when the process is stopping, so open sockets end themselves.
    shutting_down: asyncio.Event = field(default_factory=asyncio.Event)


def hello(hub: CameraHub) -> dict:
    """The first message on every socket: which cameras exist (a frame names
    one by its index here) and how each status looks on the page."""
    return {
        "hello": {
            "cameras": hub.names,
            "scales": list(SCALES),
            "status": {
                str(int(status)): {"text": CAMERA_STATUS_TEXT[status], "tone": camera_tone(status)}
                for status in Status
            },
            "stale": CAMERA_STALE,
        }
    }


def parse_view(message: str) -> dict[str, Want]:
    """`{"view": {pv: {"px": …, "fps": …}}}` → wants. Anything malformed is
    an empty view rather than an error: the page sends its whole state each
    time, so the next good message puts everything right."""
    try:
        view = json.loads(message)["view"]
        return {
            str(pv): Want(
                px=max(1, int(item.get("px", 0))),
                fps=max(0.1, float(item.get("fps", 1))),
                lossless=bool(item.get("lossless", False)),
            )
            for pv, item in view.items()
        }
    except (ValueError, KeyError, TypeError, AttributeError):
        logger.warning("camera socket: ignoring malformed view message")
        return {}


def build_camera_blueprint() -> Blueprint:
    blueprint = Blueprint("cameras", __name__)

    @blueprint.get(STATS_PATH)
    async def camera_stats():
        """What `/monitor` shows about cameras, as JSON — read directly when
        the cameras are embedded, fetched from here when they are not."""
        return jsonify(current_app.cameras.hub.stats())

    @blueprint.websocket(SOCKET_PATH)
    async def camera_socket():
        service: CameraService = current_app.cameras
        hub = service.hub
        viewer = hub.viewer()
        await websocket.accept()
        await websocket.send(json.dumps(hello(hub)))

        async def receive() -> None:
            while True:
                rejected = viewer.want(parse_view(await websocket.receive()))
                if rejected:
                    await websocket.send(json.dumps({"rejected": rejected}))

        async def send() -> None:
            while True:
                for delivery in await viewer.next():
                    await websocket.send(pack_frame(delivery.header, delivery.payload))

        tasks = [
            asyncio.create_task(receive()),
            asyncio.create_task(send()),
            asyncio.create_task(service.shutting_down.wait()),
        ]
        try:
            await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            viewer.close()

    return blueprint
