"""The sign-in page, the sign-out button, and the gate in front of everything.

Three small things, in one file so that "what is reachable without signing in"
is one list that can be read at a glance:

    /login          the form, and the POST that checks it
    /logout         clears the cookie
    PUBLIC_PATHS    everything else requires a session

The gate is HTTP middleware rather than a dependency on each route, because
routes here are generated from the zone's folders: a dependency is something a
new screen could be added without, and "the screen someone forgot to protect"
is precisely the failure that must not be possible. Middleware cannot be
forgotten.

A browser asking for a page is redirected to the form; anything else (the SSE
stream, `/api/write`) gets a status code, because redirecting a fetch to an HTML
login page produces a confusing error rather than an honest one.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response

from core.auth import COOKIE_NAME, DEV_PASSWORD, DEV_USER, AuthError, Authenticator, SessionCodec

logger = logging.getLogger("core.auth")

#: Reachable without a session. Health checks because a container's probe has no
#: browser and no credentials; static files because the login page needs its own
#: stylesheet. Everything else — every screen, every stream, every write, and
#: `/stats` — is behind the gate.
PUBLIC_PATHS = ("/login", "/logout", "/static/", "/health/", "/favicon.ico")


def is_public(path: str) -> bool:
    return any(
        path == entry.rstrip("/") or path.startswith(entry)
        for entry in PUBLIC_PATHS
    )


def client_ip(request: Request) -> str:
    """Where a sign-in came from, for the console line.

    `X-Forwarded-For` is honoured because a station may sit behind a reverse
    proxy, and its first entry is the closest thing to the truth available. It
    is attacker-controlled, so it is used for a log line and nothing else.
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "-"


def safe_next(target: str | None, fallback: str) -> str:
    """Where to go after signing in.

    Only a path on this host: `?next=https://elsewhere/` would turn the login
    form into an open redirect, which is how a phishing link gets to borrow a
    trusted address. A protocol-relative `//host` is a URL too, hence the second
    check.
    """
    if not target or not target.startswith("/") or target.startswith("//"):
        return fallback
    return target


def build_login_router(*, home: str) -> APIRouter:
    router = APIRouter()

    @router.get("/login", include_in_schema=False)
    async def login_form(request: Request, next: str | None = None) -> Response:
        state = request.app.state
        identity = state.sessions.read(request.cookies.get(COOKIE_NAME))
        destination = safe_next(next, home)
        if identity is not None:
            # Already signed in — a bookmarked /login should not look like a
            # sign-out.
            return RedirectResponse(destination, status_code=303)
        return _render_form(request, next=destination)

    @router.post("/login", include_in_schema=False)
    async def login_submit(
        request: Request,
        username: str = Form(default=""),
        password: str = Form(default=""),
        next: str | None = Form(default=None),
    ) -> Response:
        state = request.app.state
        authenticator: Authenticator = state.authenticator
        sessions: SessionCodec = state.sessions
        destination = safe_next(next, home)

        try:
            via = authenticator.check(username, password, client=client_ip(request))
        except AuthError as exc:
            # 401, not 200: a monitoring system watching a station's logs and
            # status codes should be able to see a wave of failed sign-ins.
            return _render_form(
                request,
                next=destination,
                username=username,
                error=exc.public,
                status_code=401,
            )

        cookie, identity = sessions.issue(username.strip(), via)
        response = RedirectResponse(destination, status_code=303)
        response.set_cookie(
            COOKIE_NAME,
            cookie,
            max_age=identity.seconds_left,
            httponly=True,
            samesite="lax",
            secure=state.settings.session_cookie_secure,
            path="/",
        )
        logger.info(
            "session issued user=%s via=%s valid=%.0fh -> %s",
            identity.user,
            identity.via,
            identity.seconds_left / 3600,
            destination,
        )
        return response

    @router.post("/logout", include_in_schema=False)
    async def logout(request: Request) -> Response:
        identity = request.app.state.sessions.read(request.cookies.get(COOKIE_NAME))
        if identity is not None:
            logger.info(
                "logout user=%s ip=%s (session had %.1fh left)",
                identity.user,
                client_ip(request),
                identity.seconds_left / 3600,
            )
        response = RedirectResponse("/login", status_code=303)
        response.delete_cookie(COOKIE_NAME, path="/")
        return response

    return router


def _render_form(
    request: Request,
    *,
    next: str,
    username: str = "",
    error: str | None = None,
    status_code: int = 200,
) -> HTMLResponse:
    state = request.app.state
    authenticator: Authenticator = state.authenticator
    template = state.jinja.get_template("login.html")
    return HTMLResponse(
        template.render(
            zone=state.zone,
            backend_label=state.settings.backend_label,
            palette=state.settings.palette,
            next=next,
            username=username,
            error=error,
            hint=_hint(authenticator),
        ),
        status_code=status_code,
    )


def _hint(authenticator: Authenticator) -> str:
    """What to type, for the two cases where the answer is not "your account".

    On a station this says to use the control-system account. In development it
    says the test credentials outright — they are in the source, in the README
    and in the startup banner, so hiding them here would only cost time.
    """
    if authenticator.dev_account:
        return f"Development instance: {DEV_USER} / {DEV_PASSWORD}, or a control-system account."
    if not authenticator.usable():
        return "No sign-in method is configured on this station — see the server log."
    return "Use your control-system (LDAP) account."


def install_gate(app, *, home: str) -> None:
    """Require a session for everything outside `PUBLIC_PATHS`.

    Also the single place that puts the identity on the request, so a route that
    wants to know who is asking — `/api/write`, which logs the actor of every
    write — cannot accidentally read it from somewhere less trustworthy.
    """

    @app.middleware("http")
    async def require_session(request: Request, call_next):
        path = request.url.path
        request.state.identity = None
        if is_public(path):
            return await call_next(request)

        identity = app.state.sessions.read(request.cookies.get(COOKIE_NAME))
        if identity is None:
            return _refuse(request, path, home=home)

        request.state.identity = identity
        return await call_next(request)


def _refuse(request: Request, path: str, *, home: str):
    """Send the browser somewhere useful, and say so once in the log.

    A page request gets the form (with `?next=`, so signing in lands on the
    screen that was asked for). A stream or a write gets 401 — Datastar would
    otherwise try to patch the login page's HTML into the screen.

    The test is "a GET that is not machinery", rather than `Accept: text/html`:
    a browser does send that header, but curl does not, and an operator poking
    at a URL deserves the form rather than a JSON object. The machinery is
    explicit and short — the live stream, and anything Datastar sent.
    """
    accept = request.headers.get("accept", "")
    is_datastar = request.headers.get("datastar-request") is not None
    is_stream = path.endswith("/stream")
    wants_json = "application/json" in accept and "text/html" not in accept
    if request.method == "GET" and not (is_datastar or is_stream or wants_json):
        target = safe_next(path if path != "/" else home, home)
        logger.info("no session: %s %s -> /login?next=%s", request.method, path, target)
        return RedirectResponse(f"/login?next={target}", status_code=307)

    logger.warning("no session: %s %s refused (401)", request.method, path)
    return JSONResponse(
        {"error": "not signed in", "login": "/login"},
        status_code=401,
    )
