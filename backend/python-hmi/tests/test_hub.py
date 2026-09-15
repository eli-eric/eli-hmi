"""The PV hub: one monitor per (PV, datatype) however many widgets or browser
tabs want it, and change coalescing so one IOC scan is one render.
"""

from __future__ import annotations

import asyncio

import pytest

from app.epics.hub import PvHub
from app.epics.sim_backend import SimBackend, SimSpec
from app.epics.types import Datatype, PvId, PvSample


class RecordingBackend:
    """Minimal `EpicsBackend` that records what the hub asked it to monitor."""

    def __init__(self):
        self.monitors: dict[PvId, object] = {}
        self.added: list[PvId] = []
        self.removed: list[PvId] = []
        self.writes: list[tuple[str, object]] = []

    async def start(self):
        pass

    async def stop(self):
        pass

    async def add_monitor(self, pv, callback):
        self.monitors[pv] = callback
        self.added.append(pv)

    async def remove_monitor(self, pv):
        self.monitors.pop(pv, None)
        self.removed.append(pv)

    async def caput(self, name, value):
        self.writes.append((name, value))

    def push(self, pv: PvId, value, severity: int = 0, ok: bool = True):
        self.monitors[pv](pv, PvSample(name=pv.name, ok=ok, value=value, severity=severity))


@pytest.fixture
async def hub():
    backend = RecordingBackend()
    hub = PvHub(backend)
    await hub.start()
    hub.backend = backend  # type: ignore[attr-defined]
    yield hub
    await hub.stop()


async def test_one_monitor_however_many_subscribers(hub):
    pv = PvId("PV:A")
    first = await hub.subscribe([pv])
    second = await hub.subscribe([pv])
    assert hub.backend.added == [pv]

    await first.close()
    assert hub.backend.removed == []  # still wanted by the second subscriber
    await second.close()
    assert hub.backend.removed == [pv]


async def test_same_pv_at_two_datatypes_is_two_monitors(hub):
    # An mbbi record read natively and as a state name are different requests.
    native, named = PvId("PV:State"), PvId("PV:State", Datatype.ENUM_STRING)
    await hub.subscribe([native, named])
    assert set(hub.backend.added) == {native, named}


async def test_a_change_wakes_only_interested_subscribers(hub):
    a, b = PvId("PV:A"), PvId("PV:B")
    watching_a = await hub.subscribe([a])
    watching_b = await hub.subscribe([b])
    hub.backend.push(a, 1)
    assert await watching_a.wait(timeout=0.1) == {a}
    assert await watching_b.wait(timeout=0.05) == set()


async def test_a_burst_coalesces_into_one_wake(hub):
    a, b = PvId("PV:A"), PvId("PV:B")
    subscription = await hub.subscribe([a, b])
    hub.backend.push(a, 1)
    hub.backend.push(b, 2)
    hub.backend.push(a, 3)
    assert await subscription.wait(timeout=0.1) == {a, b}


async def test_a_repeated_identical_reading_does_not_repaint(hub):
    # An IOC republishing the same value every second must not repaint the panel
    # every second — the timestamp alone is not a visible change.
    pv = PvId("PV:A")
    subscription = await hub.subscribe([pv])
    hub.backend.push(pv, 1)
    await subscription.wait(timeout=0.1)
    hub.backend.push(pv, 1)
    assert await subscription.wait(timeout=0.05) == set()


async def test_a_severity_change_alone_does_repaint(hub):
    pv = PvId("PV:A")
    subscription = await hub.subscribe([pv])
    hub.backend.push(pv, 1)
    await subscription.wait(timeout=0.1)
    hub.backend.push(pv, 1, severity=2)
    assert await subscription.wait(timeout=0.1) == {pv}


async def test_a_monitor_that_cannot_be_created_reports_as_a_bad_reading(hub):
    # Not silence: the operator has to see that this PV is unavailable.
    async def boom(pv, callback):
        raise RuntimeError("no such channel")

    hub._backend.add_monitor = boom  # type: ignore[attr-defined]
    pv = PvId("PV:MISSING")
    subscription = await hub.subscribe([pv])
    sample = subscription.snapshot()[pv]
    assert sample is not None and not sample.ok


async def test_the_cache_is_what_makes_server_side_rendering_worth_anything(hub):
    pv = PvId("PV:A")
    await hub.subscribe([pv])
    hub.backend.push(pv, 42)
    # A page rendered later — by a different request — already knows the value.
    assert hub.snapshot([pv])[pv].value == 42


class TestSimulator:
    async def test_a_write_is_held_against_the_drift(self):
        backend = SimBackend(tick_seconds=0.01, seed=1)
        backend.declare(SimSpec("PV:F", "float", value=1.0, low=0.0, high=10.0, hold_seconds=5.0))
        hub = PvHub(backend)
        await hub.start()
        try:
            pv = PvId("PV:F")
            await hub.subscribe([pv])
            await hub.caput("PV:F", 7.5)
            await asyncio.sleep(0.05)
            assert hub.get(pv).value == 7.5
        finally:
            await hub.stop()

    async def test_an_enum_reads_as_its_name_or_its_index_by_datatype(self):
        backend = SimBackend(tick_seconds=10, seed=1)
        backend.declare(SimSpec("PV:S", "enum", value=1, enums=("OFF", "ON")))
        hub = PvHub(backend)
        await hub.start()
        try:
            native, named = PvId("PV:S"), PvId("PV:S", Datatype.ENUM_STRING)
            await hub.subscribe([native, named])
            assert hub.get(native).value == 1
            assert hub.get(named).value == "ON"
        finally:
            await hub.stop()


class TestLinkHealth:
    async def test_up_while_any_pv_has_a_usable_reading(self, hub):
        pv = PvId("PV:A")
        await hub.subscribe([pv])
        hub.backend.push(pv, 1)
        assert hub.link_ok

    async def test_down_when_every_channel_has_gone(self, hub):
        # A gateway restart or a pulled cable disconnects every channel at once;
        # one dead IOC among many does not, and shows as PV DSC on its own row.
        a, b = PvId("PV:A"), PvId("PV:B")
        await hub.subscribe([a, b])
        hub.backend.push(a, 1)
        hub.backend.push(b, 2)
        assert hub.link_ok
        hub.backend.push(a, None, ok=False)
        assert hub.link_ok  # one channel is not the link
        hub.backend.push(b, None, ok=False)
        assert not hub.link_ok

    async def test_startup_grace_keeps_the_banner_quiet_while_connecting(self):
        # Nothing has arrived yet is also true one second after boot, and a
        # banner that cries wolf at boot is one operators learn to ignore.
        hub = PvHub(RecordingBackend(), startup_grace=30.0)
        await hub.start()
        try:
            await hub.subscribe([PvId("PV:A")])
            assert hub.link_ok
        finally:
            await hub.stop()

    async def test_no_grace_means_silence_reads_as_a_dead_link(self):
        hub = PvHub(RecordingBackend(), startup_grace=0.0)
        await hub.start()
        try:
            await hub.subscribe([PvId("PV:A")])
            assert not hub.link_ok
        finally:
            await hub.stop()


class TestLastValid:
    async def test_the_tooltip_can_still_say_where_the_machine_was(self, hub):
        # INVALID and a disconnected channel both replace the reading on screen,
        # which leaves the tooltip as the only thing that can report the value.
        pv = PvId("PV:A")
        subscription = await hub.subscribe([pv])
        hub.backend.push(pv, 24.81)
        hub.backend.push(pv, None, ok=False)
        sample = subscription.snapshot()[pv]
        assert sample.last_valid is not None
        assert sample.last_valid.value == 24.81

    async def test_an_alarmed_but_readable_value_is_still_the_last_good_one(self, hub):
        pv = PvId("PV:A")
        subscription = await hub.subscribe([pv])
        hub.backend.push(pv, 1.0)
        hub.backend.push(pv, 2.0, severity=2)  # MAJOR, but a real reading
        hub.backend.push(pv, None, ok=False)
        assert subscription.snapshot()[pv].last_valid.value == 2.0


class TestNaN:
    async def test_a_sensor_stuck_at_nan_does_not_repaint_forever(self, hub):
        pv = PvId("PV:A")
        subscription = await hub.subscribe([pv])
        hub.backend.push(pv, float("nan"))
        await subscription.wait(timeout=0.1)
        hub.backend.push(pv, float("nan"))
        assert await subscription.wait(timeout=0.05) == set()


class TestSimulatorCommands:
    async def test_two_commands_on_one_record_do_not_collide(self):
        """MODBOX_ON/OFF on a single mode PV is a configuration the schema
        blesses; keying handlers by PV alone let the later one silently win."""
        backend = SimBackend(tick_seconds=10, seed=1)
        backend.declare(SimSpec("PV:OUT", "int", value=0, drifts=False))
        ran: list[str] = []

        async def on(_sim, _value):
            ran.append("on")

        async def off(_sim, _value):
            ran.append("off")

        backend.register_command("PV:MODE", on, value=1)
        backend.register_command("PV:MODE", off, value=0)
        hub = PvHub(backend)
        await hub.start()
        try:
            await hub.caput("PV:MODE", 1)
            await asyncio.sleep(0.05)
            await hub.caput("PV:MODE", 0)
            await asyncio.sleep(0.05)
            assert ran == ["on", "off"]
        finally:
            await hub.stop()
