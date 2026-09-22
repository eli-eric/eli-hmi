"""Application entry point — one process that is both the HMI and its EPICS
gateway.

    make run                                   # simulator, TESTZ
    ZONE_CODE=01 EPICS_BACKEND=aioca uv run python -m core
    uv run python -m core                      # zone from the hostname

What happens at start-up, in order, because each step can fail in a way that
should stop the process rather than produce a plausible-looking screen:

1. Work out the zone (`core.zones.resolve_zone_code`) — the environment, else
   the hostname. Ambiguity is fatal: a control room screen quietly showing
   another zone's PVs is worse than one that did not start.
2. Read the zone folder: every GUI folder becomes a screen, a route and a menu
   entry, and every component's YAML block is validated.
3. Ask each component what its PVs are (`pv_specs`) and hand those to the
   simulator, so a screen written in YAML works with no IOC.
4. Work out who is allowed in (`core.auth`) — LDAP, and the built-in test
   account when `DEV=1` — and refuse to start in production without a session
   secret, because the alternative is signing every operator out on each deploy.
5. Open the monitors and warm the cache, so the first page render has values.

The framework is Quart: Flask's API — routes, blueprints, `request`, `g` — on
ASGI, which is what an app whose main output is a long-lived SSE response
needs. Hypercorn, by the same author, serves it.
"""

from __future__ import annotations

import logging
import sys
from dataclasses import dataclass, field
from typing import Any

from quart import Quart, jsonify

from core.auth import Authenticator, SessionCodec, config_from_env, log_startup, session_secret
from core.epics.hub import PvHub
from core.jinja import STATIC_ROOT, create_environment
from core.login import build_login_blueprint, install_gate
from core.page import Page, build_pages
from core.routes import build_blueprint
from core.settings import Settings, SettingsError
from core.zones import Zone, ZoneError, load_zone, resolve_zone_code

logger = logging.getLogger(__name__)


@dataclass
class Hmi:
    """Everything a request needs, assembled once at start-up.

    Quart has no `app.state`, and module-level globals would make two apps in
    one process — which every test creates — share a hub. So this hangs off the
    app as `app.hmi`, and a view reaches it through `current_app.hmi`.
    """

    settings: Settings
    zone: Zone
    hub: PvHub
    jinja: Any
    pages: dict[str, Page]
    authenticator: Authenticator
    sessions: SessionCodec
    #: The screen `/` redirects to, and where signing in lands by default.
    home: str = "/"
    warm: Any = field(default=None, repr=False)


def build_backend(settings: Settings, zone: Zone):
    """Pick the source of PV data.

    `sim` is the development and demo path and is self-contained: it is seeded
    from the components' own `pv_specs()`, so a new YAML screen needs no mock
    written for it. `aioca` is the production target and is imported lazily, so
    a laptop without `epicscorelibs` can still run the UI.
    """
    if settings.epics_backend == "aioca":
        from core.epics.aioca_backend import AiocaBackend

        return AiocaBackend()
    if settings.epics_backend != "sim":
        raise SettingsError(
            f"EPICS_BACKEND={settings.epics_backend!r} is not recognised "
            f"(expected 'sim' or 'aioca')"
        )
    from core.epics.sim_backend import SimBackend, seed_from_specs

    backend = SimBackend(tick_seconds=settings.sim_tick_seconds, seed=settings.sim_seed)
    specs = [spec for gui in zone.guis for spec in gui.all_pv_specs()]
    seed_from_specs(backend, specs)
    return backend


def create_app(settings: Settings | None = None) -> Quart:
    settings = settings or Settings.from_env()
    logging.basicConfig(
        level=settings.log_level,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    )

    code, how = (
        (settings.zone_code, "ZONE_CODE") if settings.zone_code else resolve_zone_code()
    )
    zone = load_zone(code, resolved_by=how)
    if not zone.guis:
        raise ZoneError(
            f"zone {code} has no screens: add a folder with a gui.yaml under {zone.path}"
        )

    env = create_environment(auto_reload=settings.dev)
    pages = build_pages(zone, env)
    hub = PvHub(build_backend(settings, zone))

    # Sign-in, before anything is served. `session_secret` raises rather than
    # inventing a key outside development: a generated key works perfectly until
    # the process restarts, which is the worst possible moment to discover it.
    authenticator = Authenticator(config_from_env(), dev_account=settings.dev)
    sessions = SessionCodec(
        session_secret(settings.session_secret, dev=settings.dev),
        hours=settings.session_hours,
    )

    app = Quart(
        __name__,
        static_folder=str(STATIC_ROOT),
        static_url_path="/static",
        # Pages are rendered through our own Jinja environment (`core.jinja`),
        # which also searches `components/`, so Quart's own template loader is
        # deliberately switched off rather than left to shadow it.
        template_folder=None,
    )
    app.hmi = Hmi(
        settings=settings,
        zone=zone,
        hub=hub,
        jinja=env,
        pages=pages,
        authenticator=authenticator,
        sessions=sessions,
        home=f"/{next(iter(pages))}" if pages else "/",
    )

    @app.before_serving
    async def start() -> None:
        await hub.start()
        if settings.prewarm:
            # Hold a subscription for every screen's PVs for the process
            # lifetime, so the cache is warm before anyone loads a page.
            # Without it the first render is a grid of `<>` — server-side
            # rendering only buys anything if the server already knows.
            #
            # The cost is monitors open with nobody watching. For a station
            # whose whole job is to display these screens that is the right
            # trade; set PREWARM=0 where it is not.
            pvs = set().union(*(page.all_pvs for page in pages.values())) if pages else set()
            app.hmi.warm = await hub.subscribe(pvs)
        log_startup(
            authenticator,
            cookie_secure=settings.session_cookie_secure,
            hours=settings.session_hours,
        )
        logger.info(
            "%s ready — zone %s (%s, from %s), %s, %d screen(s): %s",
            settings.app_name,
            zone.code,
            zone.title,
            zone.resolved_by,
            settings.backend_label,
            len(zone.guis),
            ", ".join(f"/{gui.slug}" for gui in zone.guis),
        )

    @app.after_serving
    async def stop() -> None:
        if app.hmi.warm is not None:
            await app.hmi.warm.close()
        await hub.stop()

    app.register_blueprint(build_login_blueprint(home=app.hmi.home))
    app.register_blueprint(build_blueprint(pages, home=app.hmi.home))
    # Registered after the blueprints but runs before every one of their views:
    # `before_request` hooks run in registration order, and nothing above is
    # reachable without passing this one.
    install_gate(app, home=app.hmi.home)

    @app.get("/health/live")
    async def health_live():
        return "live", 200, {"content-type": "text/plain; charset=utf-8"}

    @app.get("/health/ready")
    async def health_ready():
        ready = hub.started
        return jsonify({"status": "ready" if ready else "starting"}), (200 if ready else 503)

    @app.get("/stats")
    async def stats():
        """What the old gateway's /stats answered, for the same reason: when a
        screen is showing `<>`, the first question is whether anyone is
        monitoring that PV at all. It also reports how the zone was chosen,
        which is the second question.
        """
        return jsonify(
            {
                "zone": zone.code,
                "zone_title": zone.title,
                "zone_resolved_by": zone.resolved_by,
                "backend": settings.epics_backend,
                "auth": authenticator.mode,
                "screens": {
                    slug: {
                        "title": page.gui.title,
                        "components": sum(1 for _ in page.gui.walk()),
                        "widgets": len(list(page.gui.all_widgets())),
                        "pvs": len(page.all_pvs),
                    }
                    for slug, page in pages.items()
                },
                "monitored_pvs": hub.monitor_count,
                "open_streams": hub.subscriber_count,
                "link_ok": hub.link_ok,
            }
        )

    return app


def serve_config(settings: Settings):
    """Hypercorn's configuration, in one place so a test can serve the app the
    way a station does."""
    from hypercorn.config import Config

    config = Config()
    config.bind = [f"{settings.host}:{settings.port}"]
    config.loglevel = settings.log_level
    # An access line per request is noise on a station whose browser polls
    # nothing and holds one stream open, and the app already logs what matters
    # (sign-ins, writes, streams opening and closing). `DEV=1` turns it on for
    # the times when the question is "did that request even arrive".
    config.accesslog = "-" if settings.dev else None
    # A screen's stream is meant to stay open for a shift. Hypercorn's default
    # 60s keep-alive would close it between heartbeats.
    config.keep_alive_timeout = 600.0
    return config


def main() -> int:
    import asyncio

    from hypercorn.asyncio import serve

    try:
        settings = Settings.from_env()
        app = create_app(settings)
    except (ZoneError, SettingsError, ValueError) as exc:
        # Startup logs the failure and exits rather than serving a broken
        # screen: the zone *is* the page here, so there is nothing sensible to
        # render without one. A missing SESSION_SECRET lands here too — better
        # a station that will not start than one nobody can stay signed in to.
        print(f"Configuration error: {exc}", file=sys.stderr)
        return 2
    asyncio.run(serve(app, serve_config(settings)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
