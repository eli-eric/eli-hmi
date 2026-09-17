"""The two halves of signing in, tested apart: the credential check and the
cookie.

The LDAP bind is injected (`Authenticator(bind=…)`), so every path a directory
can take — accepted, refused, unreachable — is exercised without one. The one
test that does touch `ldap3` only checks that the bind is *addressed* correctly,
which is the part a rename or a zone move would break.
"""

from __future__ import annotations

import base64
import json
import logging
import time

import pytest

from core.auth import (
    DEV_PASSWORD,
    DEV_USER,
    AuthError,
    Authenticator,
    Identity,
    LdapConfig,
    SessionCodec,
    log_startup,
    session_secret,
)

LDAP = LdapConfig(server_url="ldap://directory.invalid", upn_domain="lcs.local")


def accepting(*_args, **_kwargs) -> None:
    return None


def refusing(*_args, **_kwargs) -> None:
    raise AuthError("invalid credentials")


def unreachable(*_args, **_kwargs) -> None:
    raise AuthError("ldap unreachable: timeout", "Sign-in is unavailable — the directory did not answer.")


class TestCredentials:
    def test_an_accepted_bind_is_a_login(self):
        auth = Authenticator(LDAP, dev_account=False, bind=accepting)
        assert auth.check("jsvacha", "hunter2") == "ldap"

    def test_a_refused_bind_says_the_same_thing_to_everyone(self):
        auth = Authenticator(LDAP, dev_account=False, bind=refusing)
        with pytest.raises(AuthError) as raised:
            auth.check("jsvacha", "wrong")
        # The console gets the reason; the browser gets one sentence.
        assert raised.value.reason == "invalid credentials"
        assert raised.value.public == "Sign-in failed."

    def test_an_unreachable_directory_is_not_the_operators_fault(self):
        """"Sign-in failed" would send an operator hunting for their password
        while the directory is down. The public message has to differ."""
        auth = Authenticator(LDAP, dev_account=False, bind=unreachable)
        with pytest.raises(AuthError) as raised:
            auth.check("jsvacha", "hunter2")
        assert "did not answer" in raised.value.public

    def test_the_user_is_addressed_as_a_principal(self):
        """The React app binds as `<user>@lcs.local` and this must match, or the
        same credentials stop working when a station is switched over."""
        seen: list[str] = []
        auth = Authenticator(
            LDAP, dev_account=False, bind=lambda cfg, user, pw: seen.append(cfg.principal(user))
        )
        auth.check("jsvacha", "hunter2")
        assert seen == ["jsvacha@lcs.local"]

    def test_an_address_typed_in_full_is_left_alone(self):
        assert LDAP.principal("jsvacha@other.tld") == "jsvacha@other.tld"

    def test_the_upn_domain_is_configurable(self):
        """It was hardcoded in the React app; a zone that is not lcs.local
        should not need a code change."""
        config = LdapConfig(server_url="ldap://x", upn_domain="eli.local")
        assert config.principal("jsvacha") == "jsvacha@eli.local"

    def test_an_empty_password_never_reaches_the_directory(self):
        """An empty password is an anonymous bind, which many directories
        accept — that is a sign-in with no credentials at all."""
        auth = Authenticator(LDAP, dev_account=False, bind=accepting)
        with pytest.raises(AuthError, match="empty username or password"):
            auth.check("jsvacha", "")


class TestDevAccount:
    def test_it_works_when_dev_is_on(self):
        auth = Authenticator(LdapConfig(), dev_account=True, bind=refusing)
        assert auth.check(DEV_USER, DEV_PASSWORD) == "dev"

    def test_it_does_not_exist_when_dev_is_off(self):
        """The one test that matters here: a station must not accept
        test/test."""
        auth = Authenticator(LDAP, dev_account=False, bind=refusing)
        with pytest.raises(AuthError):
            auth.check(DEV_USER, DEV_PASSWORD)

    def test_a_typo_in_its_password_does_not_fall_through_to_ldap(self):
        """Otherwise a development machine would try to bind as
        test@lcs.local — a real directory account, possibly locked out by the
        attempt."""
        attempts: list[str] = []
        auth = Authenticator(
            LDAP, dev_account=True, bind=lambda cfg, user, pw: attempts.append(user)
        )
        with pytest.raises(AuthError):
            auth.check(DEV_USER, "wrong")
        assert attempts == []

    def test_a_real_user_still_goes_to_ldap_on_a_dev_machine(self):
        auth = Authenticator(LDAP, dev_account=True, bind=accepting)
        assert auth.check("jsvacha", "hunter2") == "ldap"

    def test_with_nothing_configured_it_says_so(self):
        auth = Authenticator(LdapConfig(), dev_account=False)
        assert not auth.usable()
        with pytest.raises(AuthError, match="no authentication backend"):
            auth.check("jsvacha", "hunter2")


class TestSessionCookie:
    codec = SessionCodec("a-secret", hours=12)

    def test_a_cookie_it_issued_reads_back(self):
        cookie, issued = self.codec.issue("jsvacha", "ldap")
        read = self.codec.read(cookie)
        assert read is not None
        assert (read.user, read.via) == ("jsvacha", "ldap")
        assert 11 * 3600 < issued.seconds_left <= 12 * 3600

    def test_a_tampered_payload_is_refused(self):
        cookie, _ = self.codec.issue("jsvacha", "ldap")
        body, signature = cookie.split(".", 1)
        forged = base64.urlsafe_b64encode(
            json.dumps({"u": "root", "v": "ldap", "iat": 0, "exp": 9999999999}).encode()
        ).decode().rstrip("=")
        assert self.codec.read(f"{forged}.{signature}") is None

    def test_another_secret_cannot_mint_one(self):
        """Two stations behind one address, or a rotated secret: the cookie must
        stop working rather than half-work."""
        other = SessionCodec("a-different-secret", hours=12)
        cookie, _ = other.issue("jsvacha", "ldap")
        assert self.codec.read(cookie) is None

    def test_an_expired_cookie_is_not_a_session(self):
        past = SessionCodec("a-secret", hours=-1)
        cookie, _ = past.issue("jsvacha", "ldap")
        assert self.codec.read(cookie) is None

    @pytest.mark.parametrize("junk", ["", "nonsense", "a.b", "....", "eyJ1IjoieCJ9"])
    def test_junk_is_refused_without_raising(self, junk):
        """A browser will send whatever it has, including a cookie from an older
        version of this app. None of it may reach a stack trace."""
        assert self.codec.read(junk) is None

    def test_the_cookie_carries_no_secret(self):
        """It is signed, not encrypted — so what it holds has to be harmless."""
        cookie, _ = self.codec.issue("jsvacha", "ldap")
        payload = json.loads(
            base64.urlsafe_b64decode(
                cookie.split(".")[0] + "=" * (-len(cookie.split(".")[0]) % 4)
            )
        )
        assert set(payload) == {"u", "v", "iat", "exp"}


class TestSecret:
    def test_production_without_a_secret_refuses_to_start(self):
        """A generated key works perfectly until the process restarts, which is
        the worst moment to find out."""
        with pytest.raises(ValueError, match="SESSION_SECRET is required"):
            session_secret("", dev=False)

    def test_development_generates_one_and_says_so(self, caplog):
        with caplog.at_level(logging.WARNING, logger="core.auth"):
            generated = session_secret("", dev=True)
        assert generated
        assert "SESSION_SECRET is unset" in caplog.text

    def test_a_configured_secret_is_used_as_given(self):
        assert session_secret("s3cret", dev=False) == "s3cret"


class TestLogging:
    """What the console says. These are assertions about operability: a line
    that does not exist cannot be grepped at 3am.
    """

    def test_a_successful_login_names_the_user_the_method_and_the_source(self, caplog):
        auth = Authenticator(LDAP, dev_account=False, bind=accepting)
        with caplog.at_level(logging.INFO, logger="core.auth"):
            auth.check("jsvacha", "hunter2", client="10.78.4.21")
        assert "login ok user=jsvacha via=ldap ip=10.78.4.21" in caplog.text

    def test_a_failed_login_is_a_warning_with_the_reason(self, caplog):
        auth = Authenticator(LDAP, dev_account=False, bind=refusing)
        with caplog.at_level(logging.INFO, logger="core.auth"):
            with pytest.raises(AuthError):
                auth.check("jsvacha", "wrong", client="10.78.4.21")
        assert "login failed user=jsvacha via=ldap" in caplog.text
        assert "reason=invalid credentials" in caplog.text
        assert caplog.records[-1].levelno == logging.WARNING

    def test_a_directory_outage_is_distinguishable_from_a_wrong_password(self, caplog):
        auth = Authenticator(LDAP, dev_account=False, bind=unreachable)
        with caplog.at_level(logging.INFO, logger="core.auth"):
            with pytest.raises(AuthError):
                auth.check("jsvacha", "hunter2")
        assert "unreachable" in caplog.text

    @pytest.mark.parametrize("bind", [accepting, refusing, unreachable])
    def test_the_password_is_never_logged(self, caplog, bind):
        auth = Authenticator(LDAP, dev_account=True, bind=bind)
        with caplog.at_level(logging.DEBUG, logger="core.auth"):
            try:
                auth.check("jsvacha", "correct-horse-battery-staple")
            except AuthError:
                pass
        assert "correct-horse" not in caplog.text

    def test_the_dev_account_is_announced_loudly_at_startup(self, caplog):
        """A station that somehow booted with DEV=1 accepts test/test from
        anyone on the zone network. That cannot be a quiet line."""
        auth = Authenticator(LdapConfig(), dev_account=True)
        with caplog.at_level(logging.INFO, logger="core.auth"):
            log_startup(auth, cookie_secure=False, hours=12)
        assert "DEV MODE" in caplog.text
        assert f"{DEV_USER}/{DEV_PASSWORD}" in caplog.text
        assert any(r.levelno >= logging.WARNING for r in caplog.records)

    def test_a_station_with_no_way_in_says_so_at_startup(self, caplog):
        auth = Authenticator(LdapConfig(), dev_account=False)
        with caplog.at_level(logging.INFO, logger="core.auth"):
            log_startup(auth, cookie_secure=True, hours=12)
        assert "no authentication backend" in caplog.text
        assert any(r.levelno >= logging.ERROR for r in caplog.records)

    def test_an_expired_session_is_logged_once_it_is_noticed(self, caplog):
        codec = SessionCodec("a-secret", hours=-1)
        cookie, _ = codec.issue("jsvacha", "ldap")
        with caplog.at_level(logging.INFO, logger="core.auth"):
            assert SessionCodec("a-secret", hours=12).read(cookie) is None
        assert "session expired for user=jsvacha" in caplog.text


class TestIdentity:
    def test_seconds_left_never_goes_negative(self):
        identity = Identity(user="x", via="ldap", issued_at=0, expires_at=int(time.time()) - 10)
        assert identity.seconds_left == 0


class TestTheRealLdapPath:
    """One test that goes through `ldap_bind` itself rather than a stand-in.

    It cannot check a successful bind without a directory, but it can check the
    failure that matters operationally: a directory that does not answer must
    come back quickly, as "unreachable", and not as "wrong password".
    """

    def test_a_dead_directory_is_reported_as_unreachable(self):
        pytest.importorskip("ldap3")
        from core.auth import ldap_bind

        # Port 1 on localhost: nothing listens, and the refusal is immediate.
        config = LdapConfig(server_url="ldap://127.0.0.1:1", timeout_seconds=2)
        started = time.perf_counter()
        with pytest.raises(AuthError) as raised:
            ldap_bind(config, "jsvacha", "hunter2")
        assert "unreachable" in raised.value.reason
        assert "did not answer" in raised.value.public
        assert time.perf_counter() - started < 5, "a dead directory must fail fast"
