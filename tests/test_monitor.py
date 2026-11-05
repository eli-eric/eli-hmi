"""`/monitor` in-process: the view model and the live stream, against a real
app on the simulator — no socket, so the tests can reach into the hub and the
log book and arrange exactly the state they are about.

The page itself, over a real socket, is `TestMonitor` in `test_app.py`.
"""

from __future__ import annotations

import asyncio
import logging

import pytest

from core.epics.types import PvId
from core.monitor import collect, monitor_events
from core.server import create_app
from core.settings import Settings, SettingsError


def build_settings(**over) -> Settings:
    fields = dict(
        zone_code="TESTZ",
        epics_backend="sim",
        sim_tick_seconds=0.2,
        render_interval=0.05,
        heartbeat_seconds=0.2,
        log_level="WARNING",
        dev=True,
        session_secret="test-secret-that-is-long-enough-for-the-codec",
    )
    return Settings(**{**fields, **over})


class TestMonitorsPanel:
    async def test_a_dead_monitor_is_listed_before_the_healthy_ones(self):
        """The panel is read to find what is broken, so that goes on top."""
        app = create_app(build_settings())
        async with app.test_app():
            dead = await app.hmi.hub.subscribe([PvId("NOT:IN:THE:SIMULATOR")])
            monitors = collect(app.hmi).monitors
            assert monitors[0].name == "NOT:IN:THE:SIMULATOR"
            assert monitors[0].state == "PV DSC"
            assert monitors[0].tone == "invalid"
            flags = [row.problem for row in monitors]
            assert flags[0] and flags == sorted(flags, reverse=True)
            await dead.close()


class TestMonitorStream:
    async def test_it_ends_when_the_process_stops_and_lets_go_of_its_client(self):
        """Like a screen's stream: Hypercorn's shutdown waits for every open
        response, so a dashboard left open would otherwise hang Ctrl-C. The
        heartbeat is far longer than the test's patience, so only the shutdown
        can be what ends it."""
        app = create_app(build_settings(heartbeat_seconds=30.0))
        async with app.test_app():
            stream = monitor_events(app.hmi, user="test", ip="-", user_agent="")
            assert await anext(stream)
            assert [client.kind for client in app.hmi.clients.active()] == ["monitor"]

            app.hmi.shutting_down.set()

            async def drain() -> None:
                async for _ in stream:
                    pass

            await asyncio.wait_for(drain(), timeout=5.0)
            assert app.hmi.clients.active() == []


class TestLogDirectory:
    def test_an_unusable_log_dir_stops_the_app_before_it_serves(self, tmp_path):
        blocker = tmp_path / "a-file"
        blocker.write_text("")
        with pytest.raises(SettingsError, match="LOG_DIR"):
            create_app(build_settings(log_dir=str(blocker)))

    async def test_after_a_restart_the_previous_run_is_still_there_under_a_divider(self, tmp_path):
        first = create_app(build_settings(log_dir=str(tmp_path)))
        async with first.test_app():
            logging.getLogger("core.test").warning("logged by the first run")

        second = create_app(build_settings(log_dir=str(tmp_path)))
        async with second.test_app():
            logging.getLogger("core.test").warning("logged by the second run")
            rows = collect(second.hmi).log

        messages = [str(row.message) for row in rows]
        now, before = (
            messages.index("logged by the second run"),
            messages.index("logged by the first run"),
        )
        assert now < before, "newest first"
        assert not rows[now].earlier and rows[before].earlier
        assert any(row.restart_above for row in rows[now + 1 : before + 1])
