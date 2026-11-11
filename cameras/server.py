"""The camera gateway as its own process.

    python -m cameras                       # zone from the hostname, port 8083
    ZONE_CODE=TESTZ make run-cameras        # simulator

Same image, same code and same zone folders as the HMI; a different process,
so a burst of camera traffic — a wall of tiles opening, a dozen focus views —
cannot delay a control write or a screen's SSE stream. Point the HMI at it
with `CAMERA_GATEWAY=http://<station>:8083`; pages then open their camera
socket here, and `/monitor` reads this process's statistics.

What it shares with the HMI is the sign-in, not a session store: the HMI's
session cookie is signed with `SESSION_SECRET`, a browser sends it to any port
of the same host, and this process checks the signature with the same secret.
So the two must be given the same `SESSION_SECRET`.

Serves nothing but cameras: the socket, the statistics, and health checks.
"""

from __future__ import annotations

import asyncio
import logging
import sys

from quart import Quart, Response, jsonify, request

from cameras.hub import CameraHub
from cameras.routes import CameraService, build_camera_blueprint
from core.auth import COOKIE_NAME, SessionCodec, session_secret
from core.login import install_socket_gate
from core.server import build_frame_source, serve_config, signal_trigger
from core.settings import Settings, SettingsError
from core.zones import ZoneError, load_zone, resolve_zone_code

logger = logging.getLogger("cameras")


def create_gateway_app(settings: Settings | None = None) -> Quart:
    settings = settings or Settings.from_env()
    logging.basicConfig(
        level=settings.log_level,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    )
    code, how = (settings.zone_code, "ZONE_CODE") if settings.zone_code else resolve_zone_code()
    zone = load_zone(code, resolved_by=how)
    cameras = zone.cameras()
    if not cameras:
        raise ZoneError(f"zone {code} shows no cameras, so a camera gateway has nothing to serve")
    sessions = SessionCodec(
        session_secret(settings.session_secret, dev=settings.dev), hours=settings.session_hours
    )

    app = Quart(__name__)
    app.cameras = CameraService(hub=CameraHub(cameras, build_frame_source(settings, cameras)))
    app.register_blueprint(build_camera_blueprint())
    install_socket_gate(app, sessions)

    @app.before_request
    async def require_session():
        if request.path.startswith("/health/"):
            return None
        if sessions.read(request.cookies.get(COOKIE_NAME)) is None:
            return Response("not signed in", status=401, content_type="text/plain")
        return None

    @app.get("/health/live")
    async def live():
        return "live", 200, {"content-type": "text/plain; charset=utf-8"}

    @app.get("/health/ready")
    async def ready():
        return jsonify({"status": "ready", "cameras": len(cameras)})

    @app.before_serving
    async def start() -> None:
        await app.cameras.hub.start()
        logger.info(
            "camera gateway ready — zone %s (from %s), %s, %d camera(s), port %d",
            zone.code,
            zone.resolved_by,
            settings.backend_label,
            len(cameras),
            settings.camera_port,
        )

    @app.after_serving
    async def stop() -> None:
        await app.cameras.hub.stop()

    return app


def main() -> int:
    from hypercorn.asyncio import serve

    try:
        settings = Settings.from_env()
        app = create_gateway_app(settings)
    except (ZoneError, SettingsError, ValueError) as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        return 2
    config = serve_config(settings)
    config.bind = [f"{settings.host}:{settings.camera_port}"]
    trigger = signal_trigger(app.cameras.shutting_down, before=lambda: logger.info("shutting down"))
    asyncio.run(serve(app, config, shutdown_trigger=trigger))
    return 0
