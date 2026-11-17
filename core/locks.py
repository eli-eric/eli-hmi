"""Exclusive write control: one browser tab at a time may write a strict PV.

A control-room rule, not a convenience: a PV that two operators can write from
two desks at once is one whose last value nobody chose. A screen marks a
control `exclusive` in its YAML, and from then on the PV behind it is held by
at most one tab:

* **take** — a tab claims a free PV explicitly ("Take control");
* **release** — the holder gives it back;
* **force** — anyone signed in takes it from the holder, after confirming, and
  the holder is told who and when;
* **lapse** — a holder whose tab has had no screen showing the PV open for the
  grace period loses it, because a closed tab cannot press Release.

The key is the PV, not the button: the write endpoint is the one place every
route to a device passes through, and the only thing it knows is the PV.

A holder is a tab *and* the user signed in on it. The tab id is the browser's
own (`sessionStorage`, minted by the page), so it is only an identifier, never
a credential — a write must match both halves, and another user who learned a
tab id gets nothing from it.

Everything here runs on the event loop and needs no lock of its own. State is
in memory: a restart releases every PV, which is the safe direction.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Any, Callable, Iterable

from core.components import slug

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Holder:
    """Who has write control of one PV, from where, and since when."""

    tab: str
    user: str
    ip: str
    screen: str
    since: float


@dataclass(frozen=True)
class Outcome:
    """What a take, force or release did."""

    granted: bool
    #: Who holds the PV now (after a take or force), or who held it.
    holder: Holder | None = None
    #: Who a force took it from. `None` when nobody else held it.
    previous: Holder | None = None


@dataclass(frozen=True)
class Held:
    """One held PV, as `/monitor` lists it."""

    pv: str
    holder: Holder
    #: When it lapses, if no screen in its tab shows it any more; else `None`.
    lapses_at: float | None


@dataclass(frozen=True)
class Forced:
    """Control of `pv` was taken from this tab by `by`."""

    pv: str
    by: Holder


class Watcher:
    """One open screen in one tab: the PVs it shows, for as long as it is open.

    While a watcher showing a PV is open in the holder's tab, the lock on that
    PV cannot lapse. The stream opens one beside its PV subscription and closes
    it in the same `finally`.
    """

    def __init__(self, table: "LockTable", *, tab: str | None, user: str, pvs: Iterable[str]):
        self._table = table
        self.tab = tab
        self.user = user
        self.pvs = frozenset(pvs)
        self.closed = False
        self._changed = asyncio.Event()
        self._events: list[Forced] = []

    async def wait(self, timeout: float | None = None) -> bool:
        """Until a lock on one of `pvs` moves. False if `timeout` ran out."""
        try:
            await asyncio.wait_for(self._changed.wait(), timeout)
        except asyncio.TimeoutError:
            return False
        self._changed.clear()
        return True

    def events(self) -> list[Forced]:
        """Forces against this tab since the last call — what its operator
        must be told, rather than discover by pressing a dead button."""
        events, self._events = self._events, []
        return events

    def _notify(self, event: Forced | None = None) -> None:
        if event is not None:
            self._events.append(event)
        self._changed.set()

    def close(self) -> None:
        if self.closed:
            return
        self.closed = True
        self._table._closed(self)


class LockTable:
    def __init__(
        self,
        exclusive: Iterable[str],
        *,
        grace_seconds: float = 60.0,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self._exclusive = frozenset(exclusive)
        self._keys = _keys(self._exclusive)
        self._grace = grace_seconds
        self._clock = clock
        self._held: dict[str, Holder] = {}
        self._watchers: list[Watcher] = []
        #: When each held PV stopped being on any screen in its holder's tab.
        self._orphaned: dict[str, float] = {}

    @property
    def exclusive(self) -> frozenset[str]:
        return self._exclusive

    def key(self, pv: str) -> str | None:
        """The PV's entry in the page's `_locks` signal, or `None` if the PV
        is not exclusive — which is how a template knows not to draw a lock."""
        return self._keys.get(pv)

    def holder(self, pv: str) -> Holder | None:
        return self._held.get(pv)

    def take(self, pv: str, *, tab: str, user: str, ip: str, screen: str) -> Outcome:
        if pv not in self._exclusive:
            # Nothing to hold: any tab may write it already.
            return Outcome(granted=False)
        current = self._held.get(pv)
        if current is not None:
            # Already yours is a success that changes nothing: `since` is when
            # control was taken, and pressing again must not rewrite it.
            return Outcome(granted=_same(current, tab, user), holder=current)
        holder = Holder(tab=tab, user=user, ip=ip, screen=screen, since=self._clock())
        self._set(pv, holder)
        logger.info("control taken %s", _who(pv, holder))
        return Outcome(granted=True, holder=holder)

    def force(self, pv: str, *, tab: str, user: str, ip: str, screen: str) -> Outcome:
        """Take it whoever has it. The caller has already asked "are you sure"."""
        if pv not in self._exclusive:
            return Outcome(granted=False)
        current = self._held.get(pv)
        if current is not None and _same(current, tab, user):
            return Outcome(granted=True, holder=current)
        holder = Holder(tab=tab, user=user, ip=ip, screen=screen, since=self._clock())
        self._set(pv, holder, forced_from=current)
        if current is None:
            logger.info("control taken %s", _who(pv, holder))
        else:
            # A WARNING, and both names on one line: the question after a
            # force is always "who took it from whom, and how long had they
            # had it".
            logger.warning(
                "control FORCED %s from user=%s ip=%s screen=%s (held since %s)",
                _who(pv, holder),
                current.user,
                current.ip,
                current.screen,
                clock_time(current.since, now=holder.since),
            )
        return Outcome(granted=True, holder=holder, previous=current)

    def release(self, pv: str, *, tab: str, user: str) -> Outcome:
        current = self._held.get(pv)
        if current is None or not _same(current, tab, user):
            return Outcome(granted=False, holder=current)
        self._set(pv, None)
        logger.info(
            "control released %s (held %s)", _who(pv, current), _held_for(current, self._clock())
        )
        return Outcome(granted=True, holder=current)

    def watch(self, *, tab: str | None, user: str, pvs: Iterable[str]) -> Watcher:
        """Note that a screen showing `pvs` is open in `tab`."""
        watcher = Watcher(self, tab=tab, user=user, pvs=pvs)
        self._watchers.append(watcher)
        self._remark()
        return watcher

    def sweep(self) -> list[tuple[str, Holder]]:
        """Release every lock abandoned for longer than the grace period.

        Called once a second by the app (`core.server`). Returns what lapsed.
        """
        now = self._clock()
        lapsed = [
            (pv, self._held[pv])
            for pv, since in list(self._orphaned.items())
            if now - since >= self._grace
        ]
        for pv, holder in lapsed:
            self._set(pv, None)
            logger.info(
                "control lapsed %s (no screen showing it in that tab for %.0fs)",
                _who(pv, holder),
                self._grace,
            )
        return lapsed

    def view(self, pvs: Iterable[str], *, tab: str | None, user: str) -> dict[str, dict[str, Any]]:
        """What one tab should show for each exclusive PV among `pvs`.

        The page's `_locks` signal, keyed by `key()`. `text` is finished prose,
        so the template only places it. `tab=None` — a first paint, before the
        browser has said which tab it is — sees every held PV as someone
        else's: the controls start locked and the stream unlocks them.
        """
        now = self._clock()
        return {
            self._keys[pv]: _seen_by(self._held.get(pv), tab=tab, user=user, now=now)
            for pv in sorted(set(pvs) & self._exclusive)
        }

    def held(self) -> list[Held]:
        """Every held PV, in name order."""
        return [
            Held(
                pv=pv,
                holder=holder,
                lapses_at=(self._orphaned[pv] + self._grace) if pv in self._orphaned else None,
            )
            for pv, holder in sorted(self._held.items())
        ]

    def refuses_write(self, pv: str, *, tab: str | None, user: str) -> str | None:
        """Why this tab may not write this PV now, or `None` if it may."""
        if pv not in self._exclusive:
            return None
        holder = self._held.get(pv)
        if holder is None:
            return f"{pv} needs exclusive control — take control first"
        if tab is not None and _same(holder, tab, user):
            return None
        return f"{pv} is controlled by {describe(holder, now=self._clock())}"

    # -- bookkeeping --------------------------------------------------------

    def _set(self, pv: str, holder: Holder | None, *, forced_from: Holder | None = None) -> None:
        if holder is None:
            self._held.pop(pv, None)
        else:
            self._held[pv] = holder
        self._remark()
        for watcher in self._watchers:
            if pv not in watcher.pvs:
                continue
            robbed = (
                forced_from is not None
                and holder is not None
                and watcher.tab is not None
                and _same(forced_from, watcher.tab, watcher.user)
            )
            watcher._notify(Forced(pv=pv, by=holder) if robbed else None)

    def _closed(self, watcher: Watcher) -> None:
        self._watchers.remove(watcher)
        self._remark()

    def _remark(self) -> None:
        """Start or stop each held PV's grace clock.

        An orphan keeps the time it was first orphaned: a second screen
        closing in the same tab must not restart the countdown.
        """
        now = self._clock()
        for pv in list(self._orphaned):
            if pv not in self._held:
                del self._orphaned[pv]
        for pv, holder in self._held.items():
            if self._on_screen(pv, holder):
                self._orphaned.pop(pv, None)
            else:
                self._orphaned.setdefault(pv, now)

    def _on_screen(self, pv: str, holder: Holder) -> bool:
        return any(
            pv in watcher.pvs
            and watcher.tab is not None
            and _same(holder, watcher.tab, watcher.user)
            for watcher in self._watchers
        )


def _keys(pvs: Iterable[str]) -> dict[str, str]:
    """`pv_L4_VCS_NL2_VV1_Open` per PV — readable in the browser's devtools,
    and a valid path segment for a Datastar expression. PV names that slug
    alike (`A:B`, `A.B`) are numbered in name order, so the keys are the same
    on every start."""
    keys: dict[str, str] = {}
    taken: set[str] = set()
    for pv in sorted(pvs):
        base = f"pv_{slug(pv, '_')}"
        key, n = base, 1
        while key in taken:
            n += 1
            key = f"{base}_{n}"
        taken.add(key)
        keys[pv] = key
    return keys


def _seen_by(holder: Holder | None, *, tab: str | None, user: str, now: float) -> dict[str, Any]:
    """One `_locks` entry: the lock on one PV, as one tab should see it."""
    if holder is None:
        return {"state": "free", "user": "", "text": ""}
    since = f"since {clock_time(holder.since, now=now)}"
    if tab is not None and _same(holder, tab, user):
        return {"state": "mine", "user": holder.user, "text": since}
    # The same operator in another tab is still someone else as far as the
    # lock goes — but "you" is the sentence that explains it.
    yours = tab is not None and holder.user == user
    who = "you, in another tab at" if yours else f"{holder.user} ·"
    return {
        "state": "other",
        "user": holder.user,
        "text": f"{who} {holder.ip} · {holder.screen} · {since}",
    }


def describe(holder: Holder, *, now: float) -> str:
    """`alice at 10.78.4.21 (vacuum) since 14:02` — who to go and ask."""
    since = clock_time(holder.since, now=now)
    return f"{holder.user} at {holder.ip} ({holder.screen}) since {since}"


def clock_time(then: float, *, now: float) -> str:
    """`14:02`, or `3 Nov 14:02` for a lock taken before today."""
    moment, today = time.localtime(then), time.localtime(now)
    if (moment.tm_year, moment.tm_yday) == (today.tm_year, today.tm_yday):
        return time.strftime("%H:%M", moment)
    return f"{moment.tm_mday} {time.strftime('%b %H:%M', moment)}"


def _who(pv: str, holder: Holder) -> str:
    # The tab id is shortened: enough to tell two tabs apart in the log, not
    # enough to be worth copying into another browser.
    return (
        f"pv={pv} user={holder.user} ip={holder.ip} screen={holder.screen} "
        f"tab={holder.tab[:6]}"
    )


def _held_for(holder: Holder, now: float) -> str:
    seconds = max(0, int(now - holder.since))
    if seconds < 60:
        return f"{seconds}s"
    if seconds < 3600:
        return f"{seconds // 60}m"
    return f"{seconds // 3600}h{seconds % 3600 // 60:02d}m"


def _same(holder: Holder, tab: str, user: str) -> bool:
    """Both halves: a tab id alone is an identifier the browser chose."""
    return holder.tab == tab and holder.user == user
