"""The sign-in page, the sign-out button, and the gate in front of everything.

Three small things, in one file so that "what is reachable without signing in"
is one list that can be read at a glance:

    /login          the form, and the POST that checks it
    /logout         clears the cookie
    PUBLIC_PATHS    everything else requires a session

The gate is a `before_request` hook rather than a decorator on each view,
because views here are generated from the zone's folders: a decorator is
something a new screen could be added without, and "the screen someone forgot
to protect" is precisely the failure that must not be possible. A hook cannot
be forgotten.

A browser asking for a page is redirected to the form; a request Datastar made
(the SSE stream, `/api/write`) gets an event that sends the browser there,
because redirecting a fetch to an HTML login page produces a confusing error
rather than an honest one; anything else gets a status code.

Every request a session lets through renews it, so `SESSION_HOURS` is how long
a station may sit unused, not how long a sign-in lasts.
"""

from __future__ import annotations

import logging
from urllib.parse import quote, urlsplit

from datastar_py import ServerSentEventGenerator as SSE
from datastar_py.quart import DatastarResponse
from quart import Blueprint, Response, current_app, g, jsonify, redirect, request

from core.auth import (
    COOKIE_NAME,
    DEV_PASSWORD,
    DEV_USER,
    AuthError,
    Authenticator,
    Identity,
    SessionCodec,
)

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


def client_ip() -> str:
    """Where a sign-in came from, for the console line.

    `X-Forwarded-For` is honoured because a station may sit behind a reverse
    proxy, and its first entry is the closest thing to the truth available. It
    is attacker-controlled, so it is used for a log line and nothing else.
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "-"


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


def build_login_blueprint(*, home: str) -> Blueprint:
    auth = Blueprint("auth", __name__)

    @auth.get("/login")
    async def login_form() -> Response:
        sessions: SessionCodec = current_app.hmi.sessions
        destination = safe_next(request.args.get("next"), home)
        if sessions.read(request.cookies.get(COOKIE_NAME)) is not None:
            # Already signed in — a bookmarked /login should not look like a
            # sign-out.
            return redirect(destination, code=303)
        return await _render_form(next=destination)

    @auth.post("/login")
    async def login_submit() -> Response:
        hmi = current_app.hmi
        authenticator: Authenticator = hmi.authenticator
        sessions: SessionCodec = hmi.sessions

        form = await request.form
        username = form.get("username", "")
        password = form.get("password", "")
        destination = safe_next(form.get("next"), home)

        try:
            via = authenticator.check(username, password, client=client_ip())
        except AuthError as exc:
            # 401, not 200: a monitoring system watching a station's logs and
            # status codes should be able to see a wave of failed sign-ins.
            return await _render_form(
                next=destination,
                username=username,
                error=exc.public,
                status_code=401,
            )

        cookie, identity = sessions.issue(username.strip(), via)
        response = redirect(destination, code=303)
        set_session_cookie(response, cookie, identity)
        logger.info(
            "session issued user=%s via=%s valid=%.0fh -> %s",
            identity.user,
            identity.via,
            identity.seconds_left / 3600,
            destination,
        )
        return response

    @auth.post("/logout")
    async def logout() -> Response:
        identity = current_app.hmi.sessions.read(request.cookies.get(COOKIE_NAME))
        if identity is not None:
            logger.info(
                "logout user=%s ip=%s (session had %.1fh left)",
                identity.user,
                client_ip(),
                identity.seconds_left / 3600,
            )
        response = redirect("/login", code=303)
        response.delete_cookie(COOKIE_NAME, path="/")
        return response

    return auth


def set_session_cookie(response: Response, cookie: str, identity: Identity) -> None:
    """The cookie's attributes, decided once for signing in and renewing alike."""
    response.set_cookie(
        COOKIE_NAME,
        cookie,
        max_age=identity.seconds_left,
        httponly=True,
        samesite="Lax",
        secure=current_app.hmi.settings.session_cookie_secure,
        path="/",
    )


async def _render_form(
    *,
    next: str,
    username: str = "",
    error: str | None = None,
    status_code: int = 200,
) -> Response:
    hmi = current_app.hmi
    template = hmi.jinja.get_template("login.html")
    return Response(
        template.render(
            zone=hmi.zone,
            backend_label=hmi.settings.backend_label,
            palette=hmi.settings.palette,
            next=next,
            username=username,
            error=error,
            hint=_hint(hmi.authenticator),
        ),
        status=status_code,
        content_type="text/html; charset=utf-8",
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

    Also the single place that puts the identity on `g`, so a view that wants to
    know who is asking — `/api/write`, which logs the actor of every write —
    cannot accidentally read it from somewhere less trustworthy.
    """

    @app.before_request
    async def require_session():
        path = request.path
        g.identity = None
        if is_public(path):
            return None

        identity = current_app.hmi.sessions.read(request.cookies.get(COOKIE_NAME))
        if identity is None:
            return _refuse(path, home=home)

        g.identity = identity
        # None lets the request through to its view.
        return None

    @app.after_request
    async def renew_session(response: Response) -> Response:
        """Push the session's expiry a full window forward on every request.

        So a screen in use never signs its operator out. The stream counts: its
        response carries the cookie too, and a screen left open overnight makes
        no other request — when its stream reconnects after a blip, that is
        what keeps the sign-in alive.
        """
        identity = g.get("identity")
        if identity is not None:
            cookie, renewed = current_app.hmi.sessions.renew(identity)
            set_session_cookie(response, cookie, renewed)
        return response


def _refuse(path: str, *, home: str):
    """Send the browser somewhere useful, and say so once in the log.

    A page request gets the form (with `?next=`, so signing in lands on the
    screen that was asked for). A request Datastar made — the stream, a write —
    gets an event that sends the browser to the same form: a plain redirect
    would have Datastar patch the login page's HTML into the screen, and a 401
    left the page frozen under a banner blaming the live link for what was a
    sign-out. Anything else gets 401.

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
        return redirect(f"/login?next={target}", code=307)

    if is_datastar:
        # The screen to come back to: a stream's path names it, anything else
        # was sent from it.
        screen = (
            path.removesuffix("/stream")
            if is_stream
            else urlsplit(request.headers.get("referer", "")).path
        )
        target = quote(safe_next(screen, home))
        logger.info("no session: %s %s -> /login?next=%s", request.method, path, target)
        return DatastarResponse([SSE.redirect(f"/login?next={target}")])

    logger.warning("no session: %s %s refused (401)", request.method, path)
    return jsonify({"error": "not signed in", "login": "/login"}), 401
