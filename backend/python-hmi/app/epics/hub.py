"""PV hub — one monitor per (PV, datatype), shared by every browser tab.

This replaces `websocket_pv_manager.py`. The shape is the same and for the same
reason: a page can reference the same PV from several widgets, and several
operators can have the same page open, but the EPICS network should see exactly
one monitor per distinct (PV, datatype). What changed is the consumer — instead
of fanning values out as JSON over a WebSocket, the hub fans out *invalidations*
to render loops that push HTML over SSE.

The cache is the reason server-side rendering works at all: a fresh page load
renders whatever the hub already knows, so the operator sees values immediately
instead of a grid of `<>` waiting for a subscription round-trip.
"""

from __future__ import annotations

import asyncio
import logging
import math
import time
from collections import defaultdict
from typing import Iterable

from app.epics.types import EpicsBackend, LastValid, PvId, PvSample

logger = logging.getLogger(__name__)


class Subscription:
    """One consumer's view of the hub: the PVs it cares about and a queue of
    the ones that have changed since it last looked.

    Changes are coalesced into a set rather than queued per update, so a PV
    updating at 10 Hz behind a 250 ms render tick costs one re-render, not ten.
    """

    def __init__(self, hub: "PvHub", pvs: Iterable[PvId]):
        self._hub = hub
        self.pvs: set[PvId] = set(pvs)
        self._dirty: set[PvId] = set()
        self._wakeup = asyncio.Event()

    def notify(self, pv: PvId) -> None:
        self._dirty.add(pv)
        self._wakeup.set()

    def mark_all_dirty(self) -> None:
        self._dirty |= self.pvs
        self._wakeup.set()

    async def wait(self, timeout: float | None = None) -> set[PvId]:
        """Wait for at least one change and return everything that changed.

        Returns an empty set on timeout, which the render loop uses as its
        heartbeat tick.
        """
        try:
            await asyncio.wait_for(self._wakeup.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            return set()
        self._wakeup.clear()
        dirty, self._dirty = self._dirty, set()
        return dirty

    def drain(self) -> set[PvId]:
        """Everything that changed since the last look, without waiting.

        Used right after a short coalescing sleep: a burst of updates from one
        IOC scan becomes a single render pass instead of one per PV.
        """
        self._wakeup.clear()
        dirty, self._dirty = self._dirty, set()
        return dirty

    def snapshot(self) -> dict[PvId, PvSample | None]:
        return self._hub.snapshot(self.pvs)

    async def close(self) -> None:
        await self._hub.unsubscribe(self)


class PvHub:
    def __init__(self, backend: EpicsBackend, *, startup_grace: float = 15.0):
        self._backend = backend
        self._startup_grace = startup_grace
        self._started_at = 0.0
        self._cache: dict[PvId, PvSample] = {}
        self._refcount: dict[PvId, int] = defaultdict(int)
        self._subscribers: set[Subscription] = set()
        self._lock = asyncio.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None
        self.started = False

    # ---------------------------------------------------------------- lifecycle

    async def start(self) -> None:
        self._loop = asyncio.get_running_loop()
        self._started_at = time.monotonic()
        await self._backend.start()
        self.started = True
        logger.info("PV hub started (backend=%s)", type(self._backend).__name__)

    async def stop(self) -> None:
        self.started = False
        async with self._lock:
            pvs = list(self._refcount)
            self._refcount.clear()
            self._subscribers.clear()
        for pv in pvs:
            try:
                await self._backend.remove_monitor(pv)
            except Exception:  # pragma: no cover - shutdown best effort
                logger.exception("Failed to remove monitor for %s", pv)
        await self._backend.stop()
        logger.info("PV hub stopped")

    @property
    def link_ok(self) -> bool:
        """Whether the process believes it can talk to EPICS at all.

        The server-side half of the old `isConnected`; the browser-side half
        (is the SSE stream alive) is the `$_age` watchdog in the template.

        There is no single "am I connected" flag to read — Channel Access has no
        session, only per-channel state — so the link is judged the way an
        operator would: **it is down when we are monitoring PVs and not one of
        them currently has a usable reading.** A gateway restart, a pulled
        cable or a wrong `EPICS_CA_ADDR_LIST` disconnects every channel at once,
        which is exactly this condition; one dead IOC among many is not, and
        correctly shows as `PV DSC` on its own readouts instead.

        The grace period covers the one case that looks identical but is not:
        start-up, where nothing has arrived because nothing has *yet* arrived.
        It applies only while the cache is completely empty — once any channel
        has reported, silence from all of them is a real answer. Without it the
        banner would flash on every boot, and a banner that cries wolf at boot
        is one operators learn to ignore.
        """
        if not self.started:
            return False
        if not self._refcount:
            return True
        if not self._cache:
            return time.monotonic() - self._started_at < self._startup_grace
        return any(sample.ok for sample in self._cache.values())

    # ------------------------------------------------------------ subscriptions

    async def subscribe(self, pvs: Iterable[PvId]) -> Subscription:
        subscription = Subscription(self, pvs)
        async with self._lock:
            self._subscribers.add(subscription)
            new: list[PvId] = []
            for pv in subscription.pvs:
                self._refcount[pv] += 1
                if self._refcount[pv] == 1:
                    new.append(pv)
        for pv in new:
            try:
                await self._backend.add_monitor(pv, self._on_sample)
            except Exception:
                logger.exception("Failed to monitor %s", pv)
                # A monitor we could not create is reported as a bad reading
                # rather than silently staying at `<>`: the operator needs to
                # see that this PV is unavailable.
                self._on_sample(
                    pv,
                    PvSample(name=pv.name, ok=False, error="monitor could not be created"),
                )
        return subscription

    async def unsubscribe(self, subscription: Subscription) -> None:
        async with self._lock:
            if subscription not in self._subscribers:
                return
            self._subscribers.discard(subscription)
            dead: list[PvId] = []
            for pv in subscription.pvs:
                self._refcount[pv] -= 1
                if self._refcount[pv] <= 0:
                    self._refcount.pop(pv, None)
                    dead.append(pv)
        for pv in dead:
            try:
                await self._backend.remove_monitor(pv)
            except Exception:  # pragma: no cover
                logger.exception("Failed to remove monitor for %s", pv)

    # -------------------------------------------------------------------- reads

    def snapshot(self, pvs: Iterable[PvId]) -> dict[PvId, PvSample | None]:
        return {pv: self._cache.get(pv) for pv in pvs}

    def get(self, pv: PvId) -> PvSample | None:
        return self._cache.get(pv)

    @property
    def monitor_count(self) -> int:
        return len(self._refcount)

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)

    # ------------------------------------------------------------------- writes

    async def caput(self, name: str, value: object) -> None:
        await self._backend.caput(name, value)

    # ----------------------------------------------------------------- internal

    @staticmethod
    def _carry_last_valid(previous: PvSample | None, sample: PvSample) -> PvSample:
        """Remember the last trustworthy reading, and carry it forward while the
        PV is bad.

        `useWebSocketData` did this in the browser. It matters because INVALID
        and a disconnected channel both replace the value on screen with
        `PV INV` / `PV DSC`, leaving the tooltip as the only thing that can say
        where the machine was when the reading was still good.
        """
        trustworthy = sample.ok and sample.severity != 3 and sample.value is not None
        if trustworthy:
            return sample.with_last_valid(LastValid(sample.value, sample.timestamp))
        if previous is None:
            return sample
        carried = previous.last_valid
        if carried is None and previous.ok and previous.value is not None:
            carried = LastValid(previous.value, previous.timestamp)
        return sample.with_last_valid(carried)

    def _on_sample(self, pv: PvId, sample: PvSample) -> None:
        """Backend callback. Must be cheap and must not block: it only updates
        the cache and flips a flag per interested subscriber.
        """
        previous = self._cache.get(pv)
        sample = self._carry_last_valid(previous, sample)
        self._cache[pv] = sample
        if previous is not None and _unchanged(previous, sample):
            return
        for subscription in self._subscribers:
            if pv in subscription.pvs:
                subscription.notify(pv)


def _unchanged(a: PvSample, b: PvSample) -> bool:
    """Skip the re-render when nothing an operator can see has changed.

    Deliberately ignores the timestamp: an IOC that republishes the same value
    every second should not repaint the panel every second. Everything the
    presentation layer reads — value, severity, status, ok, units — is compared.
    """
    return (
        _same_value(a.value, b.value)
        and a.severity == b.severity
        and a.status == b.status
        and a.ok == b.ok
        and a.units == b.units
        and a.error == b.error
    )


def _same_value(a: object, b: object) -> bool:
    """`NaN != NaN`, so a broken sensor stuck at NaN would otherwise repaint its
    cell on every single update, forever.
    """
    if isinstance(a, float) and isinstance(b, float) and math.isnan(a) and math.isnan(b):
        return True
    return a == b
