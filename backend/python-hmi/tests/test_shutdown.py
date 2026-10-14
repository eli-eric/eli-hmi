"""Ctrl-C has to work while a screen is open.

The failure this guards against was a deadlock, not a crash: an SSE response is
a connection that never completes on its own, Hypercorn's shutdown waits for
every connection to be dropped (`Server.wait_closed()` since Python 3.12.1,
before its `graceful_timeout` is ever consulted), and the stream only woke for
PV changes. So the process waited for the browser while the browser waited for
the process. Ctrl-C looked like it did nothing, and pressing it again could not
help — Hypercorn's signal handler only sets an event.

Both halves are tested: the stream ends itself when told, and the trigger tells
it on the signals a station actually sends (Ctrl-C, and `docker stop`).
"""

from __future__ import annotations

import asyncio
import signal

import pytest

from core.routes import _stream_events
from core.server import _shutdown_trigger, create_app
from core.settings import Settings


def build_settings(**over) -> Settings:
    return Settings(
        zone_code="TESTZ",
        epics_backend="sim",
        sim_tick_seconds=0.2,
        render_interval=0.05,
        log_level="WARNING",
        dev=True,
        session_secret="test-secret-that-is-long-enough-for-the-codec",
        **over,
    )


class TestStreamShutdown:
    async def test_an_open_stream_ends_when_the_process_stops(self):
        """The heartbeat is set far longer than the test's patience on purpose:
        only the shutdown event can end this stream, so a pass cannot be the
        loop simply waking up on its own."""
        app = create_app(build_settings(heartbeat_seconds=30.0))
        async with app.test_app():
            stopping = asyncio.Event()
            slug = next(iter(app.hmi.pages))
            stream = _stream_events(
                slug,
                app.hmi.pages[slug],
                app.hmi.hub,
                app.hmi.settings,
                user="test",
                shutting_down=stopping,
            )
            # Take the first render, so the generator is parked in its wait.
            assert await anext(stream)
            await asyncio.sleep(0.05)

            stopping.set()

            async def drain() -> int:
                count = 0
                async for _ in stream:
                    count += 1
                return count

            # Ends on its own. Nothing cancels it: the shutdown that would is
            # the very thing waiting for this response to finish.
            await asyncio.wait_for(drain(), timeout=5.0)

    async def test_a_stream_releases_its_subscription_on_the_way_out(self):
        """The `finally` has to run even on this exit path, or a stopping
        process leaves its monitors open and `after_serving` waits on them."""
        app = create_app(build_settings(heartbeat_seconds=30.0, prewarm=False))
        async with app.test_app():
            stopping = asyncio.Event()
            slug = next(iter(app.hmi.pages))
            stream = _stream_events(
                slug,
                app.hmi.pages[slug],
                app.hmi.hub,
                app.hmi.settings,
                user="test",
                shutting_down=stopping,
            )
            await anext(stream)
            assert app.hmi.hub.subscriber_count == 1

            stopping.set()
            async for _ in stream:
                pass
            assert app.hmi.hub.subscriber_count == 0


class TestShutdownTrigger:
    @pytest.mark.parametrize("signal_name", ["SIGINT", "SIGTERM"])
    async def test_a_signal_tells_the_streams_to_stop(self, signal_name):
        """Ctrl-C is SIGINT; `docker stop` and systemd send SIGTERM. Both have
        to reach the streams, or the container hangs until its kill timeout."""
        app = create_app(build_settings())
        trigger = _shutdown_trigger(app)
        waiting = asyncio.ensure_future(trigger())
        await asyncio.sleep(0.05)  # let the handlers install
        assert not app.hmi.shutting_down.is_set()

        signal.raise_signal(getattr(signal, signal_name))

        await asyncio.wait_for(waiting, timeout=5.0)
        assert app.hmi.shutting_down.is_set(), (
            f"{signal_name} did not reach the open streams — shutdown would wait "
            "for a connection that has not been told to end"
        )
