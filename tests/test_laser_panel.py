"""The laser panel: the judgements in `readings.py`, and the reverse index that
decides what an SSE patch contains.

The one bespoke component, so the one with bespoke tests. Everything here is a
rule an operator's reading of the screen depends on.
"""

from __future__ import annotations

import pytest

from core.epics.types import Datatype, PvId, PvSample
from components.laser_panel import LaserPanel
from components.laser_panel.config import SignalOptions
from core.components import PvReader
from core.jinja import create_environment
from core.page import Page
from core.zones import load_zone


@pytest.fixture(scope="module")
def zone():
    return load_zone("TESTZ")


@pytest.fixture(scope="module")
def panel(zone) -> LaserPanel:
    """The NL2 panel as the TESTZ zone configures it."""
    gui = zone.gui("l4-opcpa")
    return gui.components[0]


@pytest.fixture(scope="module")
def spec(panel):
    """The laser's config — what the component was built from."""
    return panel.config


def build_panel(zone, **overrides) -> LaserPanel:
    """The zone's NL2 panel, rebuilt with a few config fields changed."""
    template = zone.gui("l4-opcpa").components[0]
    config = template.config.model_copy(update=overrides)
    return LaserPanel(key="test", config=config)


def reader(samples: dict[PvId, PvSample | None], connected: bool = True) -> PvReader:
    return PvReader(samples, connected)


def ok(name: str, value, severity: int = 0) -> PvSample:
    return PvSample(name=name, ok=True, value=value, severity=severity, timestamp=1.0)


def all_good(spec) -> dict[PvId, PvSample]:
    samples: dict[PvId, PvSample] = {
        PvId(spec.pvs.connection): ok(spec.pvs.connection, 1),
        PvId(spec.pvs.full_power): ok(spec.pvs.full_power, 1),
    }
    for item in spec.mss:
        samples[PvId(item.pv)] = ok(item.pv, 1)
    for item in spec.module_errors:
        samples[PvId(item.pv)] = ok(item.pv, "0000")
    return samples


class TestTheSequencerPill:
    """The row above the sequences says what they say.

    Derived rather than read from a flag of its own: a second PV repeating
    what the rows below already say is a second thing that can be wrong, and
    the disagreement would show as a pill contradicting its own list.
    """

    def read_pill(self, spec, running: dict[str, int]):
        from components.laser_panel import readings

        samples = {
            PvId(item.pv): ok(item.pv, running.get(item.pv, 0))
            for item in spec.sequences
            if item.pv in running or running
        }
        panel = LaserPanel(key="test", config=spec)
        return readings.sequencer_pill(reader(samples), spec, panel)["readout"]

    def test_running_while_any_sequence_is(self, spec):
        one = spec.sequences[2].pv
        assert self.read_pill(spec, {one: 1}).text == "RUNNING"

    def test_idle_when_none_is(self, spec):
        assert self.read_pill(spec, {item.pv: 0 for item in spec.sequences}).text == "IDLE"

    def test_unknown_until_one_reports(self, spec):
        from components.laser_panel import readings

        panel = LaserPanel(key="test", config=spec)
        readout = readings.sequencer_pill(reader({}), spec, panel)["readout"]
        assert readout.text == "<>"


class TestUnits:
    """What a reading is measured in is the component's to know. Every zone's
    file used to repeat the same five lines, which is five chances to disagree
    with the hardware."""

    def test_a_reading_carries_the_component_s_unit(self, spec):
        from components.laser_panel import readings

        row = readings.bias_row(
            reader({PvId(spec.pvs.modbox_mbc1): ok(spec.pvs.modbox_mbc1, 2100)}),
            spec,
        )
        assert row["pairs"][0]["readout"].units == "mV"
        assert row["pairs"][0]["readout"].text == "2100", "whole millivolts"

    def test_a_photodiode_reads_to_three_decimals(self, spec, panel):
        """Fixed rather than unrounded: a double delivered by Channel Access
        carries digits the detector never measured, and `0.30000000000000004`
        in a cell is worse than a thousandth of a millijoule is useful."""
        pv = spec.pvs.phd_mean
        context = panel.widgets["phd_mean"].build(reader({PvId(pv): ok(pv, 0.123456)}))
        assert context["readout"].text == "0.123"

    def test_a_photodiode_reading_that_is_not_a_number_is_a_fault(self, spec, panel):
        """Channel Access delivers a record at its native type, so a string
        here means the screen is pointed at something that is not an `ai` —
        which must read as broken, not as a value."""
        pv = spec.pvs.phd_mean
        context = panel.widgets["phd_mean"].build(reader({PvId(pv): ok(pv, "0.123")}))
        assert context["readout"].text == "PV INV"
        assert "expected a number, got str" in (context["readout"].title or "")

    def test_a_chiller_reads_the_way_its_quantity_is_measured(self, spec, panel):
        """Three decimals was the shared default and suits none of these: a
        chiller cell is ~3.9rem wide, and a water level reported to a
        thousandth of a percent is three characters of noise."""
        chiller = spec.chillers[0]
        for quantity, pv, value, expected in (
            ("temp", chiller.temp, 24.8137, "24.81"),
            ("level", chiller.level, 92.4, "92"),
        ):
            context = panel.widgets[f"chiller_0_{quantity}"].build(
                reader({PvId(pv): ok(pv, value)})
            )
            assert context["readout"].text == expected, quantity

    def test_a_temperature_reads_to_two_decimals(self, spec, panel):
        """Three was the shared default and is more than a regen loop's sensor
        can mean; a station reading 22.456 invites a conclusion about the
        third digit."""
        pv = spec.pvs.regen_temp
        context = panel.widgets["regen_temp"].build(reader({PvId(pv): ok(pv, 22.456)}))
        assert context["readout"].text == "22.46"

    def test_the_record_s_own_egu_wins_over_the_component(self, spec):
        from components.laser_panel import readings

        sample = PvSample(
            name=spec.pvs.modbox_mbc1,
            ok=True,
            value=2.1,
            severity=0,
            timestamp=1.0,
            units="V",
        )
        row = readings.bias_row(reader({PvId(spec.pvs.modbox_mbc1): sample}), spec)
        assert row["pairs"][0]["readout"].units == "V"

    def test_a_laser_can_correct_a_device_that_reports_the_wrong_one(self, zone, spec):
        """The one reason a unit is still writable: it is written in the
        signal's own entry, beside the PV it belongs to."""
        from components.laser_panel import readings

        signals = {**spec.signals}
        signals["modboxMbc1"] = signals["modboxMbc1"].model_copy(
            update={"units": "mV"}
        ) if "modboxMbc1" in signals else SignalOptions(units="mV")
        corrected = build_panel(zone, signals=signals).config
        sample = PvSample(
            name=spec.pvs.modbox_mbc1,
            ok=True,
            value=2100,
            severity=0,
            timestamp=1.0,
            units="V",
        )
        row = readings.bias_row(reader({PvId(spec.pvs.modbox_mbc1): sample}), corrected)
        assert row["pairs"][0]["readout"].units == "mV"

class TestOverview:
    def test_all_good_reads_yes_and_zero_errors(self, spec, panel):
        context = panel.widgets["overview"].build(reader(all_good(spec)))
        assert context["conn"].text == "YES"
        assert context["mss"].text == "YES"
        assert context["mss"].tone == "positive-important"
        assert context["err"].text == f"0/{len(spec.module_errors)}"

    def test_one_failed_mss_bit_reads_no_but_is_not_coloured(self, spec, panel):
        # A red "NO" would be the panel's own opinion about a value the control
        # system did not flag. Absence of green is the signal.
        samples = all_good(spec)
        samples[PvId(spec.mss[0].pv)] = ok(spec.mss[0].pv, 0)
        context = panel.widgets["overview"].build(reader(samples))
        assert context["mss"].text == "NO"
        assert context["mss"].tone is None

    def test_an_alarmed_mss_bit_cannot_read_yes_in_green(self, spec, panel):
        samples = all_good(spec)
        samples[PvId(spec.mss[0].pv)] = ok(spec.mss[0].pv, 1, severity=2)
        context = panel.widgets["overview"].build(reader(samples))
        assert context["mss"].tone == "error"

    def test_an_error_code_is_never_coloured_by_its_value(self, spec, panel):
        """21 is not "worse" than 0 to a screen that cannot know what either
        means. Counting lives in `TestModuleErrorCodes`; this is only about
        the panel refusing to read significance into the number."""
        samples = all_good(spec)
        samples[PvId(spec.module_errors[0].pv)] = ok(spec.module_errors[0].pv, 21)
        context = panel.widgets["overview"].build(reader(samples))
        assert context["err"].tone == "positive-important"  # nothing alarmed


class TestFlashlamps:
    def _channels(self, spec, states):
        return {
            PvId(item.pv, Datatype.ENUM_STRING): ok(item.pv, state)
            for item, state in zip(spec.flashlamps, states)
        }

    def test_counts_by_state(self, spec, panel):
        states = ["STANDBY"] * len(spec.flashlamps)
        states[0] = states[1] = "RUN"
        states[2] = "STOP"
        context = panel.widgets["flashlamp_counts"].build(reader(self._channels(spec, states)))
        assert context["counts"] == {
            "SB": len(spec.flashlamps) - 3,
            "RUN": 2,
            "STOP": 1,
            "FAIL": 0,
        }

    def test_an_unusable_channel_is_not_counted(self, spec, panel):
        # Counting a dead channel would let it report itself as RUN, and the
        # tally would claim every flashlamp is accounted for.
        samples = self._channels(spec, ["RUN"] * len(spec.flashlamps))
        first = spec.flashlamps[0].pv
        samples[PvId(first, Datatype.ENUM_STRING)] = PvSample(name=first, ok=False, error="dead")
        context = panel.widgets["flashlamp_counts"].build(reader(samples))
        assert context["counts"]["RUN"] == len(spec.flashlamps) - 1
        assert "no usable reading" in context["title"]

    def test_an_alarmed_channel_is_still_counted(self, spec, panel):
        # Its reading is real; the control system is just unhappy about it.
        samples = self._channels(spec, ["RUN"] * len(spec.flashlamps))
        first = spec.flashlamps[0].pv
        samples[PvId(first, Datatype.ENUM_STRING)] = ok(first, "RUN", severity=1)
        context = panel.widgets["flashlamp_counts"].build(reader(samples))
        assert context["counts"]["RUN"] == len(spec.flashlamps)

    def test_states_outside_the_four_columns_are_counted_nowhere(self, spec, panel):
        states = ["IGNITION"] * len(spec.flashlamps)
        context = panel.widgets["flashlamp_counts"].build(reader(self._channels(spec, states)))
        assert sum(context["counts"].values()) == 0


class TestTriggerDelay:
    def test_equal_readouts_render_the_value_with_its_unit(self, spec, panel):
        samples = {PvId(name): ok(name, 790) for name in spec.trigger_delay}
        readout = panel.widgets["trigger_delay"].build(reader(samples))["readout"]
        assert readout.text == "790"
        assert readout.units == "ns"

    def test_unequal_readouts_are_flagged(self, spec, panel):
        # The one condition no PV can report: they are specified to be equal.
        samples = {PvId(name): ok(name, 790 + i) for i, name in enumerate(spec.trigger_delay)}
        readout = panel.widgets["trigger_delay"].build(reader(samples))["readout"]
        assert readout.text.startswith("MISMATCH")
        assert readout.tone == "negative-important"

    def test_an_untrustworthy_readout_outranks_the_mismatch_check(self, spec, panel):
        samples = {PvId(name): ok(name, 790 + i) for i, name in enumerate(spec.trigger_delay)}
        first = spec.trigger_delay[0]
        samples[PvId(first)] = PvSample(name=first, ok=False, error="dead")
        readout = panel.widgets["trigger_delay"].build(reader(samples))["readout"]
        assert readout.tone == "invalid"


class TestTransportLoss:
    def test_every_readout_greys_out_but_keeps_its_value(self, spec, panel):
        samples = {PvId(spec.pvs.phd_mean): ok(spec.pvs.phd_mean, 1.234)}
        readout = panel.widgets["phd_mean"].build(reader(samples, connected=False))["readout"]
        assert readout.tone == "unknown"
        assert readout.text == "1.234"


class TestSections:
    def test_sections_with_no_devices_are_omitted(self, panel, spec):
        # No chillers -> no Chillers widgets, as in `laser-panel-instance.tsx`.
        assert ("chiller_0_flow" in panel.widgets) == bool(spec.chillers)
        assert ("flashlamp_counts" in panel.widgets) == bool(spec.flashlamps)
        assert ("modbox_pill" in panel.widgets) == bool(spec.modbox)


class TestPage:
    @pytest.fixture(scope="class")
    def view(self):
        zone = load_zone("TESTZ")
        return Page(zone, zone.gui("l4-opcpa"), create_environment())

    def test_a_changed_pv_renders_only_the_widgets_that_read_it(self, view, spec):
        touched = view.widgets_for([PvId(spec.pvs.phd_mean)])
        assert [widget.id for widget in touched] == ["NL2-phd-mean"]

    def test_a_widget_reading_many_changed_pvs_renders_once(self, view, spec):
        dirty = [PvId(item.pv) for item in spec.mss]
        ids = [widget.id for widget in view.widgets_for(dirty)]
        assert sorted(ids) == ["NL2-mss-list", "NL2-overview"]

    def test_enum_string_and_native_are_different_monitors(self, view, spec):
        # An mbbi read natively sends its index; the panel needs the name.
        assert PvId(spec.pvs.regen_state, Datatype.ENUM_STRING) in view.all_pvs
        assert PvId(spec.pvs.regen_state) not in view.all_pvs

    def test_every_widget_id_is_unique(self, view):
        ids = [widget.id for widget in view.gui.all_widgets()]
        assert len(ids) == len(set(ids))

    def test_signals_cover_every_expandable_region(self, view):
        signals = view.signals()
        assert signals["NL2_mss"] is False
        assert signals["_age"] == 0

    def test_patch_markup_matches_what_the_page_rendered(self, view, spec):
        """The whole point of one renderer: a cell pushed over SSE is identical
        to the cell the page was rendered with."""
        samples = {PvId(spec.pvs.phd_mean): ok(spec.pvs.phd_mean, 1.5)}
        read = reader(samples)
        page = view.render(read, backend_label="sim")
        patch = view.render_patch(read, [PvId(spec.pvs.phd_mean)])
        assert patch in page


class TestOverviewStrictBooleans:
    def test_a_value_that_is_neither_0_nor_1_is_not_a_confident_no(self, spec, panel):
        # `OverviewBoolCell` is a three-way branch: an mbbi reporting 2 must
        # read as `<>`, not as "NO".
        samples = all_good(spec)
        samples[PvId(spec.pvs.connection)] = ok(spec.pvs.connection, 2)
        context = panel.widgets["overview"].build(reader(samples))
        assert context["conn"].text == "<>"


class TestASequenceNeverRun:
    """A sequence record is UDF — EPICS severity INVALID — until the control
    system runs it for the first time, which on a cold IOC is every one of
    them. `PV INV` across the whole list every morning teaches an operator to
    ignore the one indicator that means a reading cannot be trusted, so here
    the value is shown and the severity is not.
    """

    @staticmethod
    def undefined(name: str, value: int) -> PvSample:
        """What an unprocessed record reads as: INVALID, because UDF."""
        return PvSample(
            name=name, ok=True, value=value, severity=3, status="UDF", timestamp=1.0
        )

    def test_the_row_reads_its_value(self, spec, panel):
        pv = spec.sequences[0].pv
        samples = {PvId(item.pv): ok(item.pv, 0) for item in spec.sequences}
        samples[PvId(pv)] = self.undefined(pv, 0)
        context = panel.widgets["sequencer_list"].build(reader(samples))
        assert context["items"][0].text == "IDLE"
        assert context["items"][0].tone is None

    def test_the_pill_reads_its_value(self, spec, panel):
        samples = {
            PvId(item.pv): self.undefined(item.pv, 0) for item in spec.sequences
        }
        running = spec.sequences[1].pv
        samples[PvId(running)] = self.undefined(running, 1)
        context = panel.widgets["sequencer_pill"].build(reader(samples))
        assert context["readout"].text == "RUNNING"
        assert context["readout"].tone is None

    def test_the_numeric_status_code_counts_too(self, spec, panel):
        """A gateway may send `epicsAlarm.h` codes rather than their names."""
        pv = spec.sequences[0].pv
        samples = {PvId(item.pv): ok(item.pv, 0) for item in spec.sequences}
        samples[PvId(pv)] = PvSample(
            name=pv, ok=True, value=0, severity=3, status=17, timestamp=1.0
        )
        context = panel.widgets["sequencer_list"].build(reader(samples))
        assert context["items"][0].text == "IDLE"

    def test_invalid_for_any_other_reason_is_still_reported(self, spec, panel):
        """Only "never run" is forgiven. A record that went INVALID while
        scanning has something wrong with it, and the row must say so."""
        pv = spec.sequences[0].pv
        samples = {PvId(item.pv): ok(item.pv, 0) for item in spec.sequences}
        samples[PvId(pv)] = PvSample(
            name=pv, ok=True, value=0, severity=3, status="SCAN", timestamp=1.0
        )
        context = panel.widgets["sequencer_list"].build(reader(samples))
        assert context["items"][0].text == "PV INV"

    def test_a_disconnected_sequence_still_says_so(self, spec, panel):
        """Only the severity is forgiven. A channel that is not there is a
        different fact, and the one an operator can act on."""
        samples = {PvId(item.pv): ok(item.pv, 0) for item in spec.sequences}
        dead = spec.sequences[0].pv
        samples[PvId(dead)] = PvSample(name=dead, ok=False, error="dead")
        context = panel.widgets["sequencer_list"].build(reader(samples))
        assert context["items"][0].text == "PV DSC"


class TestAWaveformPresetNeverLoaded:
    """The preset record is undefined until the Modbox initialises and writes
    the waveform it will send — the same shape of fact as a sequence nobody
    has run, and forgiven the same way."""

    def test_the_row_reads_the_name(self, spec, panel):
        pv = spec.pvs.loaded_waveform
        sample = PvSample(
            name=pv, ok=True, value="std-100ps", severity=3, status="UDF", timestamp=1.0
        )
        context = panel.widgets["waveform_preset"].build(reader({PvId(pv): sample}))
        assert context["readout"].text == "std-100ps"
        assert context["readout"].tone is None

    def test_invalid_for_any_other_reason_is_still_reported(self, spec, panel):
        pv = spec.pvs.loaded_waveform
        sample = PvSample(
            name=pv, ok=True, value="std-100ps", severity=3, status="READ", timestamp=1.0
        )
        context = panel.widgets["waveform_preset"].build(reader({PvId(pv): sample}))
        assert context["readout"].text == "PV INV"


class TestSequencerTooltips:
    def test_an_idle_sequencer_says_so(self, spec, panel):
        samples = {PvId(item.pv): ok(item.pv, 0) for item in spec.sequences}
        context = panel.widgets["sequencer_pill"].build(reader(samples))
        assert context["readout"].text == "IDLE"

    def test_a_bad_reading_is_reported_rather_than_counted_as_idle(self, spec, panel):
        """One unreadable sequence must not read as "nothing is running"."""
        samples = {PvId(item.pv): ok(item.pv, 0) for item in spec.sequences}
        dead = spec.sequences[0].pv
        samples[PvId(dead)] = PvSample(name=dead, ok=False, error="dead")
        context = panel.widgets["sequencer_pill"].build(reader(samples))
        assert context["readout"].text == "PV DSC"


class TestWaveformCatalog:
    """The Modbox serves its own waveform list, and it changes while the
    machine is running — a list baked into config is wrong by the second
    shift. The React panel fetches it from the browser; here the server does,
    which needs no CORS on the device and puts the list in the first paint.
    """

    @staticmethod
    def stub(payload, calls=None):
        """A tiny HTTP server standing in for a Modbox."""
        import json
        from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
        from threading import Thread

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):  # noqa: N802 - http.server's interface
                if calls is not None:
                    calls.append(self.path)
                body = json.dumps(payload() if callable(payload) else payload)
                self.send_response(200)
                self.send_header("content-type", "application/json")
                self.send_header("content-length", str(len(body)))
                self.end_headers()
                self.wfile.write(body.encode())

            def log_message(self, *_):  # keep the test output clean
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        Thread(target=server.serve_forever, daemon=True).start()
        return server, f"http://127.0.0.1:{server.server_port}/waveforms"

    async def test_the_list_comes_from_the_lasers_own_endpoint(self, zone):
        server, url = self.stub(["alpha", "beta"])
        try:
            panel = build_panel(zone, waveforms_url=url)
            await panel.warm()
            assert panel.context()["waveforms"] == ["alpha", "beta"]
        finally:
            server.shutdown()

    async def test_the_list_reads_alphabetically(self, zone):
        """A Modbox answers in whatever order its own store holds, which is
        the order waveforms were created. An operator looking for one name in
        a drop-down is reading, not browsing."""
        server, url = self.stub(["ramp-up", "Broad-200ps", "std-100ps", "narrow-50ps"])
        try:
            panel = build_panel(zone, waveforms_url=url)
            await panel.warm()
            assert panel.context()["waveforms"] == [
                "Broad-200ps",
                "narrow-50ps",
                "ramp-up",
                "std-100ps",
            ], "case must not decide the order either"
        finally:
            server.shutdown()

    def test_a_configured_list_reads_alphabetically_too(self, zone):
        panel = build_panel(zone, waveforms=["zulu", "alpha", "Mike"])
        assert panel.context()["waveforms"] == ["alpha", "Mike", "zulu"]

    async def test_nothing_can_be_sent_from_an_empty_catalog(self, zone):
        """A device that answers with nothing, or stops answering, leaves both
        waveform controls with nothing to send — so both Confirm buttons go
        dead. `$signal === ''` alone does not cover it: a list that empties
        under a selection already made would leave the button live, offering
        to send a name the device no longer has.
        """
        server, url = self.stub([])
        try:
            panel = build_panel(zone, waveforms_url=url)
            await panel.warm()
            available = f"{panel.key}_waveforms_available"
            assert panel.signals[available] is False
        finally:
            server.shutdown()

    async def test_a_catalog_that_answers_puts_the_buttons_back(self, zone):
        server, url = self.stub(["alpha"])
        try:
            panel = build_panel(zone, waveforms_url=url)
            await panel.warm()
            assert panel.signals[f"{panel.key}_waveforms_available"] is True
        finally:
            server.shutdown()

    async def test_an_unreachable_modbox_leaves_the_screen_usable(self, zone):
        """A device that does not answer must not take the page with it."""
        panel = build_panel(zone, waveforms_url="http://127.0.0.1:9/waveforms")
        await panel.warm()
        assert panel.context()["waveforms"] == []

    async def test_reopening_the_cog_picks_up_a_changed_catalog(self, zone):
        """The catalog changes while the machine runs, so a list fetched once
        at start-up is wrong by the second shift."""
        served = [["alpha"]]
        server, url = self.stub(lambda: served[0])
        try:
            panel = build_panel(zone, waveforms_url=url)
            await panel.warm()
            assert panel.context()["waveforms"] == ["alpha"]

            served[0] = ["alpha", "gamma"]
            await panel.warm()
            assert panel.context()["waveforms"] == ["alpha", "gamma"]
        finally:
            server.shutdown()


class TestModuleErrorCodes:
    """The codes are numeric PVs, and what counts as a fault is the IOC's to
    say. A panel deciding that 0 is healthy would be a second, private notion
    of "bad" living in the screen — and the comparison that was here, against
    the string "0000", would have called every numeric reading an error.
    """

    def _overview(self, spec, panel, codes):
        samples = all_good(spec)
        for item, (value, severity) in zip(spec.module_errors, codes):
            samples[PvId(item.pv)] = ok(item.pv, value, severity)
        return panel.widgets["overview"].build(reader(samples))

    def test_an_alarmed_code_is_counted(self, spec, panel):
        codes = [(1024, 2)] + [(0, 0)] * (len(spec.module_errors) - 1)
        context = self._overview(spec, panel, codes)
        assert context["err"].text == f"1/{len(spec.module_errors)}"

    def test_a_code_nobody_alarmed_is_not(self, spec, panel):
        """Non-zero and unflagged: shown as it arrives, counted as nothing."""
        codes = [(33, 0)] * len(spec.module_errors)
        context = self._overview(spec, panel, codes)
        assert context["err"].text == f"0/{len(spec.module_errors)}"
        assert context["err"].tone == "positive-important"


class TestYdfaCurrent:
    """The laser under test has no YDFA current to set, so the shipped zone
    does not list the command and the screen has no control for it (see
    `TestOptionalCommands` in test_app.py).

    The component still supports it for a laser that does — this is what that
    support is. If no laser ever asks for it, this and the `SEND_YDFA_CURRENT`
    entry in `commands.py` are what comes out.
    """

    COMMANDS = {
        "SEND_YDFA_CURRENT": "SEND_YDFA_CURRENT",
        "MODBOX_ON": "MODBOX_ON",
    }

    def test_a_laser_that_lists_it_gets_the_command(self, zone):
        panel = build_panel(zone, commands=self.COMMANDS)
        assert panel.config.can("SEND_YDFA_CURRENT")
        assert panel.context()["cmd"]["SEND_YDFA_CURRENT"]["pv"] == (
            "CMD_NL2_SEND_YDFA_CURRENT"
        )

    def test_the_amplifier_s_range_is_declared_with_it(self, zone):
        """The bounds travel with the command, not with the screen: the write
        endpoint reads them from here for every route to the PV."""
        panel = build_panel(zone, commands=self.COMMANDS)
        limits = panel.limits["CMD_NL2_SEND_YDFA_CURRENT"]
        assert (limits.min, limits.max, limits.precision) == (0, 6, 1)

    def test_a_laser_that_does_not_declares_nothing(self, zone):
        panel = build_panel(zone, commands={"MODBOX_ON": "MODBOX_ON"})
        assert not panel.config.can("SEND_YDFA_CURRENT")
        assert "CMD_NL2_SEND_YDFA_CURRENT" not in panel.limits
