"""Exclusive write control: one browser tab at a time controls a device.

A control-room rule, not a convenience: a device that two operators can drive
from two desks at once is one whose last command nobody chose. Control is
registered per PV — the write endpoint is the one place every route to a
device passes through, and the only thing it knows is the PV — but taken and
released per **unit**: every PV one component writes (`Gui.control_units`).
A laser is one unit, its registers' setpoints included, so no desk can write
a register of a laser another desk is running. Units that share a PV are
joined into one, with a warning: taking any part of a device takes all of it.

* **first** — the first tab to show a unit nobody holds has it, with nothing
  to press: a page opening a screen takes every free unit on it;
* **take** — a tab claims a free unit explicitly ("Take control");
* **release** — the holder gives it back;
* **force** — anyone signed in takes it from the holder, after confirming, and
  the holder is told who and when;
* **lapse** — a holder whose tab has had no screen showing any of the unit
  open for the grace period loses it, because a closed tab cannot press
  Release. If exactly one other tab is showing any of it then, control
  **passes** to that tab, which is told; with none, or with several waiting,
  it is left free.

A holder is a tab *and* the user signed in on it. The tab id is the browser's
own (`sessionStorage`, minted by the page), so it is only an identifier, never
a credential — a write must match both halves, and another user who learned a
tab id gets nothing from it.

Everything here runs on the event loop and needs no lock of its own. State is
in memory: a restart releases every unit, which is the safe direction.
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
    """One held unit, as `/monitor` lists it."""

    unit: "Unit"
    holder: Holder
    #: When it lapses, if no screen in its tab shows it any more; else `None`.
    lapses_at: float | None


@dataclass(frozen=True)
class Forced:
    """Control of `unit` was taken from this tab by `by`."""

    unit: "Unit"
    by: Holder


@dataclass(frozen=True)
class Given:
    """Control of `unit` passed to this tab when `previous` went away."""

    unit: "Unit"
    previous: Holder


class Watcher:
    """One open screen in one tab: the PVs it shows, for as long as it is open.

    While a watcher showing a PV is open in the holder's tab, the lock on that
    PV cannot lapse. The stream opens one beside its PV subscription and closes
    it in the same `finally`.
    """

    def __init__(
        self,
        table: "LockTable",
        *,
        tab: str | None,
        user: str,
        pvs: Iterable[str],
        ip: str = "-",
        screen: str = "-",
    ):
        self._table = table
        self.tab = tab
        self.user = user
        self.pvs = frozenset(pvs)
        #: Where the screen is open, for a lock it is given rather than takes.
        self.ip = ip
        self.screen = screen
        self.closed = False
        self._changed = asyncio.Event()
        self._events: list[Forced | Given] = []

    async def wait(self, timeout: float | None = None) -> bool:
        """Until a lock on one of `pvs` moves. False if `timeout` ran out."""
        try:
            await asyncio.wait_for(self._changed.wait(), timeout)
        except asyncio.TimeoutError:
            return False
        self._changed.clear()
        return True

    def events(self) -> list[Forced | Given]:
        """Forces against this tab, and control passed to it, since the last
        call — what its operator must be told, rather than discover by
        pressing a dead button or by not knowing a live one is theirs."""
        events, self._events = self._events, []
        return events

    def _notify(self, event: Forced | Given | None = None) -> None:
        if event is not None:
            self._events.append(event)
        self._changed.set()

    def close(self) -> None:
        if self.closed:
            return
        self.closed = True
        self._table._closed(self)


class LockTable:
    """Who controls which exclusive PVs, kept per unit.

    A plain PV given to the table is a unit of its own; a `Unit` is several
    PVs taken and released together. Every operation accepts a unit's key or
    any PV in it: whoever takes one PV of a device takes all of it.
    """

    def __init__(
        self,
        exclusive: Iterable["str | Unit"],
        *,
        grace_seconds: float = 60.0,
        clock: Callable[[], float] = time.time,
    ) -> None:
        joined = _join(_as_units(exclusive))
        self._units = {unit.key: unit for unit in joined.values()}
        #: A unit's own key, for each unit that was joined into another.
        self._aliases = joined
        self._unit_of = {pv: unit for unit in self._units.values() for pv in unit.pvs}
        self._exclusive = frozenset(self._unit_of)
        self._keys = _keys(self._units.values())
        self._grace = grace_seconds
        self._clock = clock
        #: Unit key -> who holds it.
        self._held: dict[str, Holder] = {}
        self._watchers: list[Watcher] = []
        #: When each held unit stopped being on any screen in its holder's tab.
        self._orphaned: dict[str, float] = {}

    @property
    def exclusive(self) -> frozenset[str]:
        return self._exclusive

    @property
    def units(self) -> list["Unit"]:
        """Every unit, in key order."""
        return [self._units[key] for key in sorted(self._units)]

    def unit(self, target: str) -> "Unit | None":
        """The unit a PV belongs to, or the unit with this key."""
        return self._unit_of.get(target) or self._units.get(target) or self._aliases.get(target)

    def key(self, target: str) -> str | None:
        """The unit's entry in the page's `_locks` signal, or `None` if the
        PV is not exclusive — which is how a template knows not to draw a
        lock. Every PV of a unit has the same entry."""
        unit = self.unit(target)
        return self._keys[unit.key] if unit is not None else None

    def holder(self, target: str) -> Holder | None:
        unit = self.unit(target)
        return self._held.get(unit.key) if unit is not None else None

    def take(self, target: str, *, tab: str, user: str, ip: str, screen: str) -> Outcome:
        unit = self.unit(target)
        if unit is None:
            # Nothing to hold: any tab may write it already.
            return Outcome(granted=False)
        current = self._held.get(unit.key)
        if current is not None:
            # Already yours is a success that changes nothing: `since` is when
            # control was taken, and pressing again must not rewrite it.
            return Outcome(granted=_same(current, tab, user), holder=current)
        holder = Holder(tab=tab, user=user, ip=ip, screen=screen, since=self._clock())
        self._set(unit, holder)
        logger.info("control taken %s", _who(unit.key, holder))
        return Outcome(granted=True, holder=holder)

    def force(self, target: str, *, tab: str, user: str, ip: str, screen: str) -> Outcome:
        """Take it whoever has it. The caller has already asked "are you sure"."""
        unit = self.unit(target)
        if unit is None:
            return Outcome(granted=False)
        current = self._held.get(unit.key)
        if current is not None and _same(current, tab, user):
            return Outcome(granted=True, holder=current)
        holder = Holder(tab=tab, user=user, ip=ip, screen=screen, since=self._clock())
        self._set(unit, holder, forced_from=current)
        if current is None:
            logger.info("control taken %s", _who(unit.key, holder))
        else:
            # A WARNING, and both names on one line: the question after a
            # force is always "who took it from whom, and how long had they
            # had it".
            logger.warning(
                "control FORCED %s from user=%s ip=%s screen=%s (held since %s)",
                _who(unit.key, holder),
                current.user,
                current.ip,
                current.screen,
                clock_time(current.since, now=holder.since),
            )
        return Outcome(granted=True, holder=holder, previous=current)

    def release(self, target: str, *, tab: str, user: str) -> Outcome:
        unit = self.unit(target)
        current = self._held.get(unit.key) if unit is not None else None
        if current is None or not _same(current, tab, user):
            return Outcome(granted=False, holder=current)
        self._set(unit, None)
        logger.info(
            "control released %s (held %s)",
            _who(unit.key, current),
            _held_for(current, self._clock()),
        )
        return Outcome(granted=True, holder=current)

    def watch(
        self,
        *,
        tab: str | None,
        user: str,
        pvs: Iterable[str],
        ip: str = "-",
        screen: str = "-",
    ) -> Watcher:
        """Note that a screen showing `pvs` is open in `tab`, and give the tab
        every unit among them that nobody holds: the first page to show a
        device is the one that controls it, with nothing to press."""
        watcher = Watcher(self, tab=tab, user=user, pvs=pvs, ip=ip, screen=screen)
        # A page that has not said which tab it is has nobody to give it to.
        if tab is not None:
            for unit in self._shown(watcher.pvs):
                if unit.key not in self._held:
                    self.take(unit.key, tab=tab, user=user, ip=ip, screen=screen)
        self._watchers.append(watcher)
        self._remark()
        return watcher

    def sweep(self) -> list[tuple[str, Holder]]:
        """Release every unit abandoned for longer than the grace period, or
        pass it to the one other tab still showing it.

        Called once a second by the app (`core.server`). Returns what lapsed,
        by unit key.
        """
        now = self._clock()
        lapsed = [
            (key, self._held[key])
            for key, since in list(self._orphaned.items())
            if now - since >= self._grace
        ]
        for key, holder in lapsed:
            unit = self._units[key]
            logger.info(
                "control lapsed %s (no screen showing it in that tab for %.0fs)",
                _who(key, holder),
                self._grace,
            )
            heir = self._heir(unit)
            if heir is None:
                self._set(unit, None)
                continue
            # The one other tab still showing it: two desks on one device,
            # and the one that had it has gone.
            given = Holder(tab=heir.tab, user=heir.user, ip=heir.ip, screen=heir.screen, since=now)
            self._set(unit, given, given_from=holder)
            logger.info("control passed %s from user=%s", _who(key, given), holder.user)
        return lapsed

    def _heir(self, unit: "Unit") -> "Watcher | None":
        """The one tab showing any of `unit`, or `None` if none does or
        several do — when several are waiting, nobody here can say which of
        them it is."""
        tabs: dict[tuple[str, str], Watcher] = {}
        for watcher in self._watchers:
            if watcher.pvs & unit.pvs and watcher.tab is not None:
                tabs.setdefault((watcher.tab, watcher.user), watcher)
        return next(iter(tabs.values())) if len(tabs) == 1 else None

    def view(self, pvs: Iterable[str], *, tab: str | None, user: str) -> dict[str, dict[str, Any]]:
        """What one tab should show for each unit any of `pvs` belong to.

        The page's `_locks` signal, keyed by `key()`. `text` is finished prose,
        so the template only places it. `tab=None` — a first paint, before the
        browser has said which tab it is — sees every held unit as someone
        else's: the controls start locked and the stream unlocks them.
        """
        now = self._clock()
        return {
            self._keys[unit.key]: _seen_by(self._held.get(unit.key), tab=tab, user=user, now=now)
            for unit in self._shown(pvs)
        }

    def held(self) -> list[Held]:
        """Every held unit, in key order."""
        return [
            Held(
                unit=self._units[key],
                holder=holder,
                lapses_at=(self._orphaned[key] + self._grace) if key in self._orphaned else None,
            )
            for key, holder in sorted(self._held.items())
        ]

    def refuses_write(self, pv: str, *, tab: str | None, user: str) -> str | None:
        """Why this tab may not write this PV now, or `None` if it may."""
        unit = self._unit_of.get(pv)
        if unit is None:
            return None
        holder = self._held.get(unit.key)
        if holder is None:
            return f"{pv} needs exclusive control — take control first"
        if tab is not None and _same(holder, tab, user):
            return None
        return f"{pv} is controlled by {describe(holder, now=self._clock())}"

    # -- bookkeeping --------------------------------------------------------

    def _shown(self, pvs: Iterable[str]) -> list["Unit"]:
        """The units any of these PVs belong to, in key order."""
        keys = {self._unit_of[pv].key for pv in pvs if pv in self._unit_of}
        return [self._units[key] for key in sorted(keys)]

    def _set(
        self,
        unit: "Unit",
        holder: Holder | None,
        *,
        forced_from: Holder | None = None,
        given_from: Holder | None = None,
    ) -> None:
        if holder is None:
            self._held.pop(unit.key, None)
        else:
            self._held[unit.key] = holder
        self._remark()
        for watcher in self._watchers:
            if not watcher.pvs & unit.pvs:
                continue
            robbed = (
                forced_from is not None
                and holder is not None
                and watcher.tab is not None
                and _same(forced_from, watcher.tab, watcher.user)
            )
            heir = (
                given_from is not None
                and holder is not None
                and watcher.tab is not None
                and _same(holder, watcher.tab, watcher.user)
            )
            if robbed:
                watcher._notify(Forced(unit=unit, by=holder))
            elif heir:
                watcher._notify(Given(unit=unit, previous=given_from))
            else:
                watcher._notify()

    def _closed(self, watcher: Watcher) -> None:
        self._watchers.remove(watcher)
        self._remark()

    def _remark(self) -> None:
        """Start or stop each held unit's grace clock.

        An orphan keeps the time it was first orphaned: a second screen
        closing in the same tab must not restart the countdown.
        """
        now = self._clock()
        for key in list(self._orphaned):
            if key not in self._held:
                del self._orphaned[key]
        for key, holder in self._held.items():
            if self._on_screen(self._units[key], holder):
                self._orphaned.pop(key, None)
            else:
                self._orphaned.setdefault(key, now)

    def _on_screen(self, unit: "Unit", holder: Holder) -> bool:
        """Whether the holder's tab shows any of the unit."""
        return any(
            watcher.pvs & unit.pvs
            and watcher.tab is not None
            and _same(holder, watcher.tab, watcher.user)
            for watcher in self._watchers
        )


@dataclass(frozen=True)
class Unit:
    """PVs taken and released together: the exclusive writes of one device.

    Control is registered per PV — the write endpoint asks about a PV — but
    taken, released, forced and handed over per unit, so a device is
    controlled from one desk or not at all.
    """

    key: str
    name: str
    pvs: frozenset[str]

    @property
    def bare(self) -> bool:
        """A single PV given to the table as itself, not as a component's."""
        return self.pvs == {self.key}


def _as_units(exclusive: Iterable["str | Unit"]) -> list[Unit]:
    """A plain PV is a unit of its own."""
    return [
        item if isinstance(item, Unit) else Unit(key=item, name=item, pvs=frozenset({item}))
        for item in exclusive
    ]


def _join(units: list[Unit]) -> dict[str, Unit]:
    """Each unit's key -> the unit it is taken as.

    Units that share a PV are one unit, transitively: whoever takes one PV of
    a device takes all of it, and a device two screens disagree about is
    still controlled from one desk. The same device on two screens is joined
    quietly; any other overlap is a slip in a screen, said once at start-up.
    """
    parent = list(range(len(units)))

    def root(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    first: dict[str, int] = {}
    for i, unit in enumerate(units):
        for pv in unit.pvs:
            j = first.setdefault(pv, i)
            parent[root(i)] = root(j)
    groups: dict[int, list[Unit]] = {}
    for i, unit in enumerate(units):
        groups.setdefault(root(i), []).append(unit)

    joined: dict[str, Unit] = {}
    for members in groups.values():
        members = sorted(members, key=lambda u: u.key)
        if len(members) == 1:
            joined[members[0].key] = members[0]
            continue
        pvs = frozenset().union(*(m.pvs for m in members))
        if any(m.pvs != pvs for m in members):
            shared = sorted(
                pv for pv in pvs if sum(pv in m.pvs for m in members) > 1
            )
            logger.warning(
                "control units %s share %s: they are taken and released as one",
                ", ".join(m.key for m in members),
                ", ".join(shared),
            )
        names = list(dict.fromkeys(m.name for m in members))
        unit = Unit(
            key="+".join(dict.fromkeys(m.key for m in members)),
            name=" + ".join(names),
            pvs=pvs,
        )
        for member in members:
            joined[member.key] = unit
    return joined


def _keys(units: Iterable[Unit]) -> dict[str, str]:
    """`unit_l4_opcpa_NL2` per unit, `pv_L4_VCS_NL2_VV1_Open` for a bare PV —
    readable in the browser's devtools, and a valid path segment for a
    Datastar expression. Keys that slug alike (`A:B`, `A.B`) are numbered in
    key order, so they are the same on every start."""
    keys: dict[str, str] = {}
    taken: set[str] = set()
    for unit in sorted(units, key=lambda u: u.key):
        base = f"{'pv' if unit.bare else 'unit'}_{slug(unit.key, '_')}"
        key, n = base, 1
        while key in taken:
            n += 1
            key = f"{base}_{n}"
        taken.add(key)
        keys[unit.key] = key
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
