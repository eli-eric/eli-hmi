"""Exclusive write control: one browser tab at a time may write a strict PV.

A tab takes control explicitly, everyone else sees who has it and since when,
and anyone may force it after a confirmation. These tests drive `LockTable`
through its public interface with a clock they move by hand, so the grace
period is tested without waiting for it.
"""

from __future__ import annotations

import json
import re
import textwrap
from html import unescape
from urllib.parse import quote

import pytest

from core.components import PvReader
from core.jinja import create_environment
from core.locks import LockTable
from core.page import Page
from core.zones import load_zone

VALVE = "L4-VCS-NL2:VV1:Open"


class Clock:
    def __init__(self, now: float = 1_700_000_000.0) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def table(clock: Clock) -> LockTable:
    return LockTable([VALVE], grace_seconds=60, clock=clock)


def take(table: LockTable, tab: str = "tab-a", user: str = "alice", **over):
    fields = dict(tab=tab, user=user, ip="10.78.4.21", screen="vacuum")
    fields.update(over)
    return table.take(VALVE, **fields)


def test_a_free_pv_can_be_taken_and_remembers_who_where_and_when(table, clock):
    assert table.holder(VALVE) is None

    outcome = take(table)

    assert outcome.granted
    holder = table.holder(VALVE)
    assert (holder.tab, holder.user, holder.ip, holder.screen, holder.since) == (
        "tab-a",
        "alice",
        "10.78.4.21",
        "vacuum",
        clock.now,
    )


def test_a_held_pv_is_refused_to_another_tab_naming_the_holder(table):
    take(table, tab="tab-a", user="alice")

    outcome = take(table, tab="tab-b", user="bob", ip="10.78.4.22")

    assert not outcome.granted
    assert outcome.holder.user == "alice"
    assert table.holder(VALVE).tab == "tab-a"


def test_taking_what_you_already_hold_keeps_the_original_time(table, clock):
    take(table)
    since = table.holder(VALVE).since
    clock.advance(30)

    assert take(table).granted
    assert table.holder(VALVE).since == since


class TestWhoMayWrite:
    def test_nobody_may_write_a_strict_pv_nobody_has_taken(self, table):
        assert "take control" in table.refuses_write(VALVE, tab="tab-a", user="alice")

    def test_the_holder_may_write(self, table):
        take(table, tab="tab-a", user="alice")
        assert table.refuses_write(VALVE, tab="tab-a", user="alice") is None

    def test_another_tab_of_the_same_user_may_not(self, table):
        take(table, tab="tab-a", user="alice")
        reason = table.refuses_write(VALVE, tab="tab-b", user="alice")
        assert "alice" in reason and "10.78.4.21" in reason

    def test_the_holders_tab_signed_in_as_someone_else_may_not(self, table):
        take(table, tab="tab-a", user="alice")
        assert table.refuses_write(VALVE, tab="tab-a", user="mallory") is not None

    def test_a_pv_that_is_not_exclusive_is_never_refused(self, table):
        assert table.refuses_write("L4-VCS-NL2:Other", tab=None, user="bob") is None

    def test_taking_a_pv_that_is_not_exclusive_grants_nothing(self, table):
        outcome = table.take(
            "L4-VCS-NL2:Other", tab="tab-a", user="alice", ip="-", screen="vacuum"
        )
        assert not outcome.granted
        assert table.holder("L4-VCS-NL2:Other") is None


class TestRelease:
    def test_the_holder_can_give_it_back(self, table):
        take(table, tab="tab-a", user="alice")

        assert table.release(VALVE, tab="tab-a", user="alice").granted
        assert table.holder(VALVE) is None
        assert take(table, tab="tab-b", user="bob").granted

    def test_nobody_else_can_release_it(self, table):
        take(table, tab="tab-a", user="alice")

        outcome = table.release(VALVE, tab="tab-b", user="bob")

        assert not outcome.granted
        assert outcome.holder.user == "alice"
        assert table.holder(VALVE).user == "alice"


class TestForce:
    def test_force_takes_it_from_the_holder_and_says_from_whom(self, table, clock):
        take(table, tab="tab-a", user="alice")
        clock.advance(120)

        outcome = table.force(VALVE, tab="tab-b", user="bob", ip="10.78.4.22", screen="vacuum")

        assert outcome.granted
        assert outcome.previous.user == "alice"
        holder = table.holder(VALVE)
        assert (holder.tab, holder.user, holder.since) == ("tab-b", "bob", clock.now)
        assert table.refuses_write(VALVE, tab="tab-a", user="alice") is not None
        assert table.refuses_write(VALVE, tab="tab-b", user="bob") is None

    def test_forcing_a_free_pv_is_simply_taking_it(self, table):
        outcome = table.force(VALVE, tab="tab-b", user="bob", ip="-", screen="vacuum")
        assert outcome.granted and outcome.previous is None

    def test_forcing_what_you_hold_changes_nothing(self, table):
        take(table, tab="tab-a", user="alice")
        since = table.holder(VALVE).since
        outcome = table.force(VALVE, tab="tab-a", user="alice", ip="-", screen="vacuum")
        assert outcome.granted and outcome.previous is None
        assert table.holder(VALVE).since == since


class TestAnAbandonedLockLapses:
    """A closed tab cannot press Release, so a lock outlives its tab only for
    the grace period — long enough for a reload or a stream reconnect."""

    def test_a_lock_whose_tab_closed_lapses_after_the_grace_period(self, table, clock):
        watcher = table.watch(tab="tab-a", user="alice", pvs=[VALVE])
        take(table, tab="tab-a", user="alice")
        watcher.close()

        clock.advance(59)
        assert table.sweep() == []
        assert table.holder(VALVE) is not None

        clock.advance(2)
        lapsed = table.sweep()
        assert [(pv, holder.user) for pv, holder in lapsed] == [(VALVE, "alice")]
        assert table.holder(VALVE) is None

    def test_a_reload_inside_the_grace_period_keeps_it(self, table, clock):
        first = table.watch(tab="tab-a", user="alice", pvs=[VALVE])
        take(table, tab="tab-a", user="alice")
        first.close()
        clock.advance(30)
        table.watch(tab="tab-a", user="alice", pvs=[VALVE])

        clock.advance(600)
        assert table.sweep() == []
        assert table.holder(VALVE).tab == "tab-a"

    def test_a_tab_still_showing_the_pv_keeps_it_indefinitely(self, table, clock):
        table.watch(tab="tab-a", user="alice", pvs=[VALVE])
        take(table, tab="tab-a", user="alice")

        clock.advance(8 * 3600)
        assert table.sweep() == []

    def test_moving_to_a_screen_without_the_pv_abandons_it(self, table, clock):
        on_vacuum = table.watch(tab="tab-a", user="alice", pvs=[VALVE])
        take(table, tab="tab-a", user="alice")
        table.watch(tab="tab-a", user="alice", pvs=[])
        on_vacuum.close()

        clock.advance(61)
        assert [pv for pv, _ in table.sweep()] == [VALVE]

    def test_a_take_from_no_screen_at_all_lapses_too(self, table, clock):
        take(table, tab="tab-a", user="alice")
        clock.advance(61)
        assert [pv for pv, _ in table.sweep()] == [VALVE]

    def test_another_tab_watching_does_not_keep_it_alive(self, table, clock):
        mine = table.watch(tab="tab-a", user="alice", pvs=[VALVE])
        table.watch(tab="tab-b", user="bob", pvs=[VALVE])
        take(table, tab="tab-a", user="alice")
        mine.close()

        clock.advance(61)
        assert [pv for pv, _ in table.sweep()] == [VALVE]


class TestWhatEachTabSees:
    def test_a_free_pv_offers_take_control(self, table):
        key = table.key(VALVE)
        assert table.view([VALVE], tab="tab-a", user="alice") == {
            key: {"state": "free", "user": "", "text": ""}
        }

    def test_the_holder_sees_it_as_theirs(self, table):
        take(table, tab="tab-a", user="alice")
        seen = table.view([VALVE], tab="tab-a", user="alice")[table.key(VALVE)]
        assert seen["state"] == "mine"
        assert seen["text"].startswith("since ")

    def test_everyone_else_sees_who_where_and_since_when(self, table):
        take(table, tab="tab-a", user="alice")
        seen = table.view([VALVE], tab="tab-b", user="bob")[table.key(VALVE)]
        assert seen["state"] == "other"
        assert seen["user"] == "alice"
        assert "alice" in seen["text"]
        assert "10.78.4.21" in seen["text"]
        assert "vacuum" in seen["text"]
        assert "since" in seen["text"]

    def test_the_same_user_in_another_tab_is_told_it_is_them(self, table):
        take(table, tab="tab-a", user="alice")
        seen = table.view([VALVE], tab="tab-b", user="alice")[table.key(VALVE)]
        assert seen["state"] == "other"
        assert "you, in another tab" in seen["text"]

    def test_a_tab_not_yet_identified_is_never_told_it_holds_anything(self, table):
        """The first paint knows no tab id: a held PV renders locked until the
        stream says otherwise, which is the safe way round."""
        take(table, tab="tab-a", user="alice")
        assert table.view([VALVE], tab=None, user="alice")[table.key(VALVE)]["state"] == "other"

    def test_pvs_that_are_not_exclusive_are_left_out(self, table):
        assert table.view(["L4-VCS-NL2:Other"], tab="tab-a", user="alice") == {}


class TestSignalKeys:
    def test_a_key_is_an_identifier_datastar_can_path_into(self):
        table = LockTable(["01-ABC:x.VAL", "L4-VCS-NL2:VV1:Open"])
        for pv in ("01-ABC:x.VAL", "L4-VCS-NL2:VV1:Open"):
            assert table.key(pv).isidentifier()

    def test_two_pvs_that_slug_alike_get_different_keys(self):
        table = LockTable(["A:B", "A.B", "A-B"])
        assert len({table.key("A:B"), table.key("A.B"), table.key("A-B")}) == 3

    def test_a_pv_that_is_not_exclusive_has_no_key(self, table):
        assert table.key("L4-VCS-NL2:Other") is None


class TestWhatIsHeld:
    """What `/monitor` lists: every held PV, and whether it is about to lapse."""

    def test_a_lock_on_screen_is_listed_with_no_deadline(self, table):
        table.watch(tab="tab-a", user="alice", pvs=[VALVE])
        take(table, tab="tab-a", user="alice")
        [held] = table.held()
        assert (held.pv, held.holder.user, held.lapses_at) == (VALVE, "alice", None)

    def test_an_abandoned_lock_says_when_it_will_lapse(self, table, clock):
        take(table, tab="tab-a", user="alice")
        [held] = table.held()
        assert held.lapses_at == clock.now + 60

    def test_nothing_held_lists_nothing(self, table):
        assert table.held() == []


class TestScreensHearAboutChanges:
    """Every screen showing a PV re-renders its lock when the lock moves —
    that is how the other desk learns the button just went dead."""

    async def test_a_take_wakes_every_screen_showing_the_pv(self, table):
        other = table.watch(tab="tab-b", user="bob", pvs=[VALVE])
        take(table, tab="tab-a", user="alice")
        assert await other.wait(timeout=1)

    async def test_a_release_a_force_and_a_lapse_all_wake_it(self, table, clock):
        other = table.watch(tab="tab-c", user="carol", pvs=[VALVE])

        take(table, tab="tab-a", user="alice")
        assert await other.wait(timeout=1)
        table.force(VALVE, tab="tab-b", user="bob", ip="-", screen="vacuum")
        assert await other.wait(timeout=1)
        table.release(VALVE, tab="tab-b", user="bob")
        assert await other.wait(timeout=1)

        take(table, tab="tab-a", user="alice")
        assert await other.wait(timeout=1)
        clock.advance(61)
        table.sweep()
        assert await other.wait(timeout=1)

    async def test_a_screen_not_showing_the_pv_sleeps_on(self, table):
        elsewhere = table.watch(tab="tab-b", user="bob", pvs=["L4-VCS-NL2:Other"])
        take(table, tab="tab-a", user="alice")
        assert not await elsewhere.wait(timeout=0.01)

    async def test_the_holder_forced_out_is_told_by_whom(self, table):
        alices = table.watch(tab="tab-a", user="alice", pvs=[VALVE])
        bystander = table.watch(tab="tab-c", user="carol", pvs=[VALVE])
        take(table, tab="tab-a", user="alice")
        alices.events()

        table.force(VALVE, tab="tab-b", user="bob", ip="10.78.4.22", screen="vacuum")

        [event] = alices.events()
        assert (event.pv, event.by.user, event.by.ip) == (VALVE, "bob", "10.78.4.22")
        assert alices.events() == []
        assert bystander.events() == []


class TestTheAuditTrail:
    def test_take_release_force_and_lapse_each_leave_a_line(self, table, clock, caplog):
        caplog.set_level("INFO", logger="core.locks")

        take(table, tab="tab-a", user="alice")
        table.force(VALVE, tab="tab-b", user="bob", ip="10.78.4.22", screen="vacuum")
        table.release(VALVE, tab="tab-b", user="bob")
        take(table, tab="tab-a", user="alice")
        clock.advance(61)
        table.sweep()

        lines = [(record.levelname, record.getMessage()) for record in caplog.records]
        assert [message.split()[1] for _level, message in lines] == [
            "taken", "FORCED", "released", "taken", "lapsed",
        ]
        level, forced = lines[1]
        assert level == "WARNING"
        assert "user=bob" in forced and "from user=alice" in forced and VALVE in forced

    def test_a_refused_take_changes_nothing_and_logs_nothing(self, table, caplog):
        take(table, tab="tab-a", user="alice")
        caplog.set_level("INFO", logger="core.locks")
        take(table, tab="tab-b", user="bob")
        assert caplog.records == []



# ---------------------------------------------------------------------------
# On the screen
# ---------------------------------------------------------------------------

VV1_OPEN = "L4-VCS-NL2:VV1:Open"
VV2_OPEN = "L4-VCS-NL2:VV2:Open"


def render(page: Page) -> str:
    return page.render(PvReader({}, True), backend_label="sim")


def buttons_writing(body: str, pv: str) -> list[str]:
    """Every `<button>` whose click writes `pv`."""
    target = f"pv={quote(pv, safe='')}"
    return [tag for tag in re.findall(r"<button\b[^>]*>", body, re.S) if target in tag and "/api/write" in tag]


def disabled(tag: str) -> bool:
    """The bare `disabled` attribute, as opposed to a `{disabled: …}` binding."""
    return re.search(r"\sdisabled[\s>]", tag) is not None


def signals(body: str) -> dict:
    return json.loads(unescape(re.search(r'class="page"\s+data-signals="([^"]*)"', body).group(1)))


@pytest.fixture(scope="module")
def zone():
    return load_zone("TESTZ")


class TestOnTheScreen:
    def page(self, zone, slug: str) -> Page:
        return Page(zone, zone.gui(slug), create_environment())

    def test_an_exclusive_button_starts_disabled_until_this_tab_has_control(self, zone):
        page = self.page(zone, "vacuum")
        key = page.locks.key(VV1_OPEN)
        [button] = buttons_writing(render(page), VV1_OPEN)
        assert disabled(button)
        assert f"$_locks.{key}.state !== 'mine'" in unescape(button)

    def test_it_offers_to_take_control_and_to_force_it(self, zone):
        body = unescape(render(self.page(zone, "vacuum")))
        assert "Take control" in body and "Force" in body and "Release" in body
        assert "/api/lock?pv=L4-VCS-NL2%3AVV1%3AOpen&action=take" in body
        assert "confirm(" in body

    def test_a_button_that_is_not_exclusive_is_left_alone(self, zone):
        [button] = buttons_writing(render(self.page(zone, "vacuum")), VV2_OPEN)
        assert "disabled" not in button and "_locks" not in button

    def test_the_page_declares_the_lock_state_and_a_tab_id(self, zone):
        page = self.page(zone, "vacuum")
        declared = signals(render(page))
        assert declared["_locks"][page.locks.key(VV1_OPEN)]["state"] == "free"
        assert isinstance(declared["tab"], str) and len(declared["tab"]) >= 16

    def test_every_render_mints_a_fresh_tab_id(self, zone):
        page = self.page(zone, "vacuum")
        assert signals(render(page))["tab"] != signals(render(page))["tab"]

    def test_the_browser_keeps_its_tab_id_across_reloads(self, zone):
        body = unescape(render(self.page(zone, "vacuum")))
        assert "sessionStorage" in body

    def test_a_laser_command_marked_exclusive_is_locked_and_stop_is_not(self, zone):
        body = render(self.page(zone, "l4-opcpa"))
        [alignment] = buttons_writing(body, "L4-OPCPA-NL2:SetAlignmentMode")
        [stop] = buttons_writing(body, "CMD_NL2_STOP_LASER")
        assert disabled(alignment)
        assert "_locks" not in stop

    def test_an_exclusive_setpoint_locks_its_field_and_confirm(self, zone):
        body = unescape(render(self.page(zone, "l4-opcpa")))
        key = self.page(zone, "l4-opcpa").locks.key("L4-OPCPA-NL2:SM5-ATT1:51:SetPosition")
        section = body[body.index("Set Attenuator"):]
        field = re.search(r'<input class="preset-field"[^>]*>', section).group(0)
        confirm = re.search(r'<button[^>]*class="preset-confirm"[^>]*>', section).group(0)
        for tag in (field, confirm):
            assert disabled(tag), tag
            assert f"$_locks.{key}.state !== 'mine'" in tag

    def test_every_write_control_on_a_screen_is_one_the_screen_declares(self, zone):
        """A lock is only drawn for a PV the screen knows it writes, so a
        control writing anything else would escape it."""
        for gui in zone.guis:
            page = self.page(zone, gui.slug)
            written = set(re.findall(r"/api/write\?pv=([^&'\"]+)", unescape(render(page))))
            declared = {quote(pv, safe="") for pv in page.written_pvs}
            assert written <= declared, f"/{gui.slug}: {sorted(written - declared)}"


def test_a_pv_exclusive_on_one_screen_is_locked_on_every_screen(tmp_path, monkeypatch):
    monkeypatch.setenv("ZONES_ROOT", str(tmp_path))
    (tmp_path / "Z").mkdir()
    (tmp_path / "Z" / "zone.yaml").write_text("title: Z\n")
    for slug, flag in (("strict", "true"), ("loose", "false")):
        (tmp_path / "Z" / slug).mkdir()
        (tmp_path / "Z" / slug / "gui.yaml").write_text(textwrap.dedent(f"""
            title: {slug}
            components:
              - component: value
                label: Shutter
                pv: S:State
                kind: bool
                actions:
                  - {{ label: Open, value: 1, pv: "S:Open", exclusive: {flag} }}
        """))
    zone = load_zone("Z")
    loose = Page(zone, zone.gui("loose"), create_environment())
    [button] = buttons_writing(render(loose), "S:Open")
    assert disabled(button)


class TestAHiddenTabKeepsItsControl:
    """Datastar closes a hidden tab's stream by default. On a screen with an
    exclusive PV that would make an operator who switched tabs for a minute
    lose control — and miss being told it was forced away — so those screens
    keep their stream open while hidden."""

    def stream_call(self, page: Page) -> str:
        return re.search(r"@get\([^)]*\)", unescape(render(page))).group(0)

    def test_a_screen_with_an_exclusive_pv_streams_while_hidden(self, zone):
        call = self.stream_call(Page(zone, zone.gui("vacuum"), create_environment()))
        assert "openWhenHidden: true" in call

    def test_a_screen_without_one_keeps_the_default(self, zone):
        call = self.stream_call(Page(zone, zone.gui("chillers"), create_environment()))
        assert "openWhenHidden" not in call
