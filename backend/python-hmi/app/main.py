"""Application entry point — one process that is both the HMI and its EPICS
gateway.

The MVP was two services: a Next.js app rendering React in the browser, and a
FastAPI + `aioca` gateway shipping PV values over a WebSocket. This is the same
system with the split removed. The gateway's `aioca` layer is still here
(`app/epics`), but instead of serialising values to JSON for a browser to render,
it hands them to Jinja and the server pushes finished HTML over
Server-Sent Events. What used to be a React component tree is now a registry of
widgets (`app/modules/l4_opcpa/widgets.py`); what used to be `useWebSocketData`
is the render loop in `routes.py`.

Run it:

    ZONE_CODE=test EPICS_BACKEND=sim python -m app          # simulator
    ZONE_CODE=test EPICS_BACKEND=aioca python -m app        # real EPICS
"""

from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from app.epics.hub import PvHub
from app.modules.l4_opcpa import routes as l4_routes
from app.modules.l4_opcpa import sim_seed
from app.modules.l4_opcpa.config import ConfigError, load_laser_specs
from app.modules.l4_opcpa.view import L4OpcpaView
from app.settings import Settings, SettingsError
from app.templating import TEMPLATE_DIR, create_environment

logger = logging.getLogger(__name__)

STATIC_DIR = TEMPLATE_DIR.parent / "static"


def build_backend(settings: Settings, specs):
    """Pick the source of PV data.

    `sim` is the development and demo path and is self-contained. `aioca` is the
    production target and is imported lazily, so a laptop without
    `epicscorelibs` can still run the UI.
    """
    if settings.epics_backend == "aioca":
        from app.epics.aioca_backend import AiocaBackend

        return AiocaBackend()
    if settings.epics_backend != "sim":
        raise ConfigError(
            f"EPICS_BACKEND={settings.epics_backend!r} is not recognised "
            f"(expected 'sim' or 'aioca')"
        )
    from app.epics.sim_backend import SimBackend

    backend = SimBackend(tick_seconds=settings.sim_tick_seconds, seed=settings.sim_seed)
    sim_seed.seed(backend, specs)
    return backend


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    logging.basicConfig(
        level=settings.log_level,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    )

    specs = load_laser_specs(settings.zone_code, cache=not settings.dev)
    env = create_environment(auto_reload=settings.dev)
    hub = PvHub(build_backend(settings, specs))

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await hub.start()
        if settings.prewarm:
            # Hold a subscription for the page's PVs for the process lifetime, so
            # the hub's cache is warm before anyone loads the page. Without it the
            # first render is a grid of `<>` — server-side rendering only buys
            # anything if the server already knows the values.
            #
            # The cost is monitors that stay open with nobody watching. For a
            # station whose whole job is to display this page that is the right
            # trade; set PREWARM=0 where it is not.
            app.state.warm = await hub.subscribe(app.state.l4_view.all_pvs)
        logger.info(
            "%s ready — zone %s, %s, %d laser(s): %s",
            settings.app_name,
            settings.zone_code,
            settings.backend_label,
            len(specs),
            ", ".join(spec.laser for spec in specs),
        )
        try:
            yield
        finally:
            warm = getattr(app.state, "warm", None)
            if warm is not None:
                await warm.close()
            await hub.stop()

    app = FastAPI(
        title="ELI HMI (server-rendered)",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
    )
    app.state.settings = settings
    app.state.hub = hub
    app.state.jinja = env
    app.state.l4_view = L4OpcpaView(specs, env)

    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
    app.include_router(l4_routes.router)

    @app.get("/health/live", include_in_schema=False)
    async def health_live() -> PlainTextResponse:
        return PlainTextResponse("live")

    @app.get("/health/ready", include_in_schema=False)
    async def health_ready() -> JSONResponse:
        ready = hub.started
        return JSONResponse(
            {"status": "ready" if ready else "starting"},
            status_code=200 if ready else 503,
        )

    @app.get("/stats", include_in_schema=False)
    async def stats() -> JSONResponse:
        """What the old gateway's /stats answered, for the same reason: when a
        panel is showing `<>`, the first question is whether anyone is
        monitoring that PV at all.
        """
        view: L4OpcpaView = app.state.l4_view
        return JSONResponse(
            {
                "zone": settings.zone_code,
                "backend": settings.epics_backend,
                "lasers": [spec.laser for spec in specs],
                "widgets": sum(len(panel.widgets) for panel in view.panels),
                "monitored_pvs": hub.monitor_count,
                "open_streams": hub.subscriber_count,
                "link_ok": hub.link_ok,
            }
        )

    return app


def main() -> int:
    import uvicorn

    try:
        settings = Settings.from_env()
        app = create_app(settings)
    except (ConfigError, SettingsError) as exc:
        # Startup logs the failure and exits, rather than serving a broken page:
        # the React app could fall back to /no-access because a bad ZONE_CODE
        # only disabled routes, but here the config *is* the page.
        print(f"Configuration error: {exc}", file=sys.stderr)
        return 2
    uvicorn.run(
        app,
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level.lower(),
        # SSE responses must not be buffered or compressed on the way out.
        access_log=settings.dev,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
