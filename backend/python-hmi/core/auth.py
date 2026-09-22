"""Who is at the keyboard: an LDAP bind, and a signed cookie saying it happened.

Two pieces, kept apart on purpose:

* :class:`Authenticator` answers "are these credentials good?" — an LDAP simple
  bind, plus the built-in ``test``/``test`` account when ``DEV=1``. It knows
  nothing about HTTP.
* :class:`SessionCodec` mints and reads the cookie that remembers the answer.
  Signed with HMAC-SHA256 and carrying its own expiry, so the server keeps no
  session table: a station can be restarted mid-shift without signing everyone
  out, and there is nothing to replicate between the zones.

Why a bind and not a directory search: it is what the React app does today
(`frontend/src/lib/server/auth/ldap-auth.ts` — simple bind as
``<user>@lcs.local``), so the same credentials that work on a station now work
here, and the HMI never needs a service account of its own. The cost is that
this cannot express "operators only"; authorisation here is the zone, as
ADR-0002 has it, not the person.

Everything an operator does to sign in is logged, because "it says invalid
credentials" and "LDAP is unreachable" are the same sentence to the person at
the keyboard and must not be the same line in the console. What is never logged,
at any level, is the password or the cookie.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import time
from dataclasses import dataclass

logger = logging.getLogger("core.auth")

#: The development account. Accepted only when `DEV=1`, and the startup banner
#: says so in as many words every time the process comes up.
DEV_USER = "test"
DEV_PASSWORD = "test"

#: Cookie name. Deliberately not `session`: a station's browser may also hold a
#: cookie from the React app on the same host, and two things called `session`
#: on one origin is a debugging afternoon nobody needs.
COOKIE_NAME = "eli_hmi_session"


class AuthError(Exception):
    """Credentials were refused, with a reason fit for the console.

    `public` is what the browser is told — always the same sentence, whether the
    user does not exist, the password is wrong or the directory is down, because
    the login form is reachable by anyone who can reach the port.
    """

    def __init__(self, reason: str, public: str = "Sign-in failed.") -> None:
        super().__init__(reason)
        self.reason = reason
        self.public = public


@dataclass(frozen=True)
class Identity:
    """Who the session belongs to, and since when."""

    user: str
    #: "ldap" or "dev" — how the credentials were checked, so a console line
    #: makes clear which one let someone in.
    via: str
    issued_at: int
    expires_at: int

    @property
    def seconds_left(self) -> int:
        return max(0, self.expires_at - int(time.time()))


# --------------------------------------------------------------------- cookie


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


class SessionCodec:
    """A session cookie: ``<payload>.<signature>``, both base64url.

    A JWT in all but name, and written out by hand for one reason — this app has
    no other use for a JWT library, and a signature check is twelve lines that
    can be read in full by whoever inherits it. The secret never leaves the
    process and the payload is signed, not encrypted: it holds a username and
    two timestamps, nothing that is not already on the screen.
    """

    def __init__(self, secret: str, *, hours: float) -> None:
        if not secret:
            raise ValueError("a session secret is required")
        self._key = secret.encode("utf-8")
        self._seconds = int(hours * 3600)

    def issue(self, user: str, via: str) -> tuple[str, Identity]:
        now = int(time.time())
        identity = Identity(user=user, via=via, issued_at=now, expires_at=now + self._seconds)
        payload = {
            "u": identity.user,
            "v": identity.via,
            "iat": identity.issued_at,
            "exp": identity.expires_at,
        }
        body = _b64(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
        return f"{body}.{self._sign(body)}", identity

    def read(self, cookie: str | None) -> Identity | None:
        """The identity a cookie proves, or None with a reason logged.

        Every rejection is one DEBUG line naming which check failed. At INFO a
        station's console would fill with them — a browser keeps sending an
        expired cookie — but when someone is being signed out "randomly", the
        difference between `expired` and `bad-signature` is the whole answer.
        """
        if not cookie:
            return None
        try:
            body, signature = cookie.split(".", 1)
        except ValueError:
            logger.debug("session rejected: malformed cookie")
            return None
        if not hmac.compare_digest(signature, self._sign(body)):
            # Either the secret changed (a restart with a generated secret, or a
            # different station) or someone edited the cookie.
            logger.debug("session rejected: bad signature")
            return None
        try:
            payload = json.loads(_unb64(body))
            identity = Identity(
                user=str(payload["u"]),
                via=str(payload.get("v", "unknown")),
                issued_at=int(payload["iat"]),
                expires_at=int(payload["exp"]),
            )
        except Exception:  # noqa: BLE001 - any malformed payload is just "no"
            logger.debug("session rejected: unreadable payload")
            return None
        if identity.expires_at <= int(time.time()):
            logger.info(
                "session expired for user=%s (issued %s ago)",
                identity.user,
                _ago(identity.issued_at),
            )
            return None
        return identity

    def _sign(self, body: str) -> str:
        return _b64(hmac.new(self._key, body.encode("ascii"), hashlib.sha256).digest())


def _ago(stamp: int) -> str:
    seconds = max(0, int(time.time()) - stamp)
    if seconds < 90:
        return f"{seconds}s"
    if seconds < 5400:
        return f"{seconds // 60}m"
    return f"{seconds / 3600:.1f}h"


# ---------------------------------------------------------------------- LDAP


@dataclass(frozen=True)
class LdapConfig:
    """Where the directory is and how to address a user.

    Same two variables the React app reads, plus the UPN domain it had hardcoded
    — a zone that is not `lcs.local` should not need a code change.
    """

    server_url: str = ""
    upn_domain: str = "lcs.local"
    use_tls: bool = False
    timeout_seconds: float = 5.0

    @property
    def configured(self) -> bool:
        return bool(self.server_url)

    def principal(self, username: str) -> str:
        """`jsvacha` -> `jsvacha@lcs.local`; an address typed in full is left
        alone, so both spellings work at the login prompt."""
        return username if "@" in username else f"{username}@{self.upn_domain}"


def ldap_bind(config: LdapConfig, username: str, password: str) -> None:
    """Bind as the user, or raise :class:`AuthError` saying why not.

    `ldap3` is imported here rather than at module scope so the app still starts
    — and the dev account still works — on a machine that has not installed it.
    """
    try:
        from ldap3 import Connection, Server
        from ldap3.core.exceptions import LDAPException
    except ImportError as exc:  # pragma: no cover - depends on the environment
        raise AuthError(
            "ldap3 is not installed (uv sync)",
            "Sign-in is unavailable on this station.",
        ) from exc

    principal = config.principal(username)
    started = time.perf_counter()
    try:
        server = Server(config.server_url, use_ssl=config.use_tls, connect_timeout=int(config.timeout_seconds))
        connection = Connection(
            server,
            user=principal,
            password=password,
            # No auto_bind: bind() returning False is an answer (wrong
            # password), while auto_bind raises, and the two must not arrive by
            # the same path.
            receive_timeout=config.timeout_seconds,
        )
        bound = connection.bind()
    except LDAPException as exc:
        # The directory could not be reached or spoke unexpectedly. This is not
        # the operator's fault and the console should not imply it is.
        raise AuthError(
            f"ldap unreachable: {config.server_url}: {exc.__class__.__name__}: {exc}",
            "Sign-in is unavailable — the directory did not answer.",
        ) from exc
    elapsed_ms = (time.perf_counter() - started) * 1000

    if not bound:
        detail = connection.result or {}
        raise AuthError(
            "invalid credentials"
            f" (ldap said {detail.get('description', 'no reason given')} in {elapsed_ms:.0f}ms)"
        )
    logger.debug("ldap bind ok for %s in %.0fms", principal, elapsed_ms)
    connection.unbind()


# ------------------------------------------------------------- the front door


class Authenticator:
    """The one place that says yes.

    `bind` is injected so the tests can exercise every path — accepted,
    refused, directory down — without a directory, and so can anyone reading
    this later.
    """

    def __init__(self, config: LdapConfig, *, dev_account: bool, bind=ldap_bind) -> None:
        self.config = config
        self.dev_account = dev_account
        self._bind = bind

    @property
    def mode(self) -> str:
        parts = []
        if self.config.configured:
            parts.append(f"LDAP {self.config.server_url}")
        if self.dev_account:
            parts.append("built-in test account")
        return " + ".join(parts) if parts else "nothing configured"

    def usable(self) -> bool:
        return self.config.configured or self.dev_account

    def check(self, username: str, password: str, *, client: str = "-") -> str:
        """Return HOW these credentials checked out ("ldap", "dev"), or raise
        :class:`AuthError`.

        It does not mint a session — that is `SessionCodec`'s job, and keeping
        the two apart is what lets the tests decide one question at a time.
        Every outcome leaves exactly one line in the console, with the username,
        how it was checked and where from — and never the password.
        """
        user = (username or "").strip()
        if not user or not password:
            self._refused(user, "dev" if self.dev_account else "ldap", client, "empty field")
            raise AuthError("empty username or password", "Enter a username and password.")

        # The built-in account is checked first and does not fall through to the
        # directory: on a development machine `test` is the test account, full
        # stop, and a typo in its password must not become an LDAP bind attempt.
        if self.dev_account and user == DEV_USER:
            if password == DEV_PASSWORD:
                logger.info("login ok user=%s via=dev ip=%s", user, client)
                return "dev"
            self._refused(user, "dev", client, "wrong password for the built-in account")
            raise AuthError("invalid credentials for the built-in dev account")

        if not self.config.configured:
            self._refused(user, "-", client, "no authentication backend configured")
            raise AuthError(
                "no authentication backend configured (set LDAP_SERVER_URL, or DEV=1)",
                "Sign-in is not configured on this station.",
            )

        started = time.perf_counter()
        try:
            self._bind(self.config, user, password)
        except AuthError as exc:
            self._refused(
                user, "ldap", client, exc.reason, (time.perf_counter() - started) * 1000
            )
            raise
        logger.info(
            "login ok user=%s via=ldap ip=%s (%.0fms)",
            user,
            client,
            (time.perf_counter() - started) * 1000,
        )
        return "ldap"

    @staticmethod
    def _refused(user: str, via: str, client: str, reason: str, ms: float | None = None) -> None:
        """One WARNING per refused attempt, in one format.

        WARNING and not INFO on purpose: a handful of these is someone
        mistyping, and a screenful is worth looking at. The password is not a
        parameter of this function, so it cannot end up in the line by accident.
        """
        logger.warning(
            "login failed user=%s via=%s ip=%s reason=%s%s",
            user or "(blank)",
            via,
            client,
            reason,
            f" ({ms:.0f}ms)" if ms is not None else "",
        )


# ------------------------------------------------------------------- settings


def config_from_env() -> LdapConfig:
    return LdapConfig(
        server_url=os.getenv("LDAP_SERVER_URL", "").strip(),
        upn_domain=os.getenv("LDAP_UPN_DOMAIN", "lcs.local").strip() or "lcs.local",
        use_tls=os.getenv("LDAP_USE_TLS", "").strip().lower() in {"1", "true", "yes", "on"},
        timeout_seconds=float(os.getenv("LDAP_TIMEOUT_SECONDS", "5") or 5),
    )


def session_secret(settings_secret: str, *, dev: bool) -> str:
    """The signing key, and a loud line when there isn't one.

    In development a random key per start is fine — it signs everyone out on
    restart and nothing else. In production the absence of a key would do the
    same thing silently, every deploy, so it is fatal instead.
    """
    if settings_secret:
        return settings_secret
    if dev:
        logger.warning(
            "SESSION_SECRET is unset: signing sessions with a key generated for this "
            "process, so a restart signs everyone out. Fine for development."
        )
        return base64.urlsafe_b64encode(os.urandom(32)).decode("ascii")
    raise ValueError(
        "SESSION_SECRET is required: without it a restart signs every operator out, "
        "and two stations behind one address would reject each other's cookies. "
        "Generate one with `python -c 'import secrets; print(secrets.token_urlsafe(32))'`."
    )


def log_startup(authenticator: Authenticator, *, cookie_secure: bool, hours: float) -> None:
    """One banner per start, so "who can sign in here" is answered by the log.

    The dev-account line is a warning and names the credentials: an operator
    station that somehow booted with `DEV=1` accepts `test`/`test` from anyone
    on the zone network, and that must be impossible to miss in a console.
    """
    logger.info(
        "authentication: %s; sessions %.0fh, cookie secure=%s",
        authenticator.mode,
        hours,
        "yes" if cookie_secure else "no",
    )
    if authenticator.dev_account:
        logger.warning(
            "DEV MODE: the built-in %s/%s account is accepted on this instance. "
            "Unset DEV to disable it.",
            DEV_USER,
            DEV_PASSWORD,
        )
    if not authenticator.usable():
        logger.error(
            "no authentication backend: nobody can sign in. Set LDAP_SERVER_URL "
            "(and see zones/README.md), or DEV=1 for the built-in test account."
        )
