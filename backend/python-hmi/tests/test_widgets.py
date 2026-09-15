"""Widget context builders — the logic that used to live in each section
component, and the reverse index that decides what a patch contains.
"""

from __future__ import annotations

import pytest

from app.epics.types import Datatype, PvId, PvSample
from app.modules.l4_opcpa.config import load_laser_specs
from app.modules.l4_opcpa.view import L4OpcpaView
from app.modules.l4_opcpa.widgets import PvReader, build_panel
from app.templating import create_environment


@pytest.fixture(scope="module")
def spec():
    return load_laser_specs("test")[0]


@pytest.fixture(scope="module")
def panel(spec):
    return build_panel(spec)


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

    def test_error_codes_are_counted_not_coloured_by_value(self, spec, panel):
        samples = all_good(spec)
        samples[PvId(spec.module_errors[0].pv)] = ok(spec.module_errors[0].pv, "0021")
        context = panel.widgets["overview"].build(reader(samples))
        assert context["err"].text == f"1/{len(spec.module_errors)}"
        assert context["err"].tone is None


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
    def test_sections_with_no_devices_are_omitted(self):
        # `laser-panel-instance.tsx`: no chillers -> no Chillers widgets.
        specs = load_laser_specs("test")
        spec = specs[0]
        panel = build_panel(spec)
        assert ("chiller_0_flow" in panel.widgets) == bool(spec.chillers)
        assert ("flashlamp_counts" in panel.widgets) == bool(spec.flashlamps)
        assert ("modbox_pill" in panel.widgets) == bool(spec.modbox)


class TestView:
    @pytest.fixture(scope="class")
    def view(self):
        return L4OpcpaView(load_laser_specs("test"), create_environment())

    def test_a_changed_pv_renders_only_the_widgets_that_read_it(self, view, spec):
        touched = view.widgets_for([PvId(spec.pvs.phd_mean)])
        assert [widget.id for widget in touched] == ["w-NL2-phd_mean"]

    def test_a_widget_reading_many_changed_pvs_renders_once(self, view, spec):
        dirty = [PvId(item.pv) for item in spec.mss]
        ids = [widget.id for widget in view.widgets_for(dirty)]
        assert sorted(ids) == ["w-NL2-mss_list", "w-NL2-overview"]

    def test_enum_string_and_native_are_different_monitors(self, view, spec):
        # An mbbi read natively sends its index; the panel needs the name.
        assert PvId(spec.pvs.regen_state, Datatype.ENUM_STRING) in view.all_pvs
        assert PvId(spec.pvs.regen_state) not in view.all_pvs

    def test_every_widget_id_is_unique(self, view):
        ids = [w.id for panel in view.panels for w in panel.widgets.values()]
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
        widget = view.panels[0].widgets["phd_mean"]
        page = view.render_page(
            read,
            stream_url="/s",
            zone_code="test",
            backend_label="sim",
            catalog=[],
        )
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


class TestSequencerTooltips:
    def test_the_pill_names_its_pv(self, spec, panel):
        # It used to route through the aggregate presentation, which says
        # nothing at severity 0 — leaving the row with no hover text at all.
        running = spec.pvs.sequencer_running
        samples = {PvId(running): ok(running, 0)}
        context = panel.widgets["sequencer_pill"].build(reader(samples))
        assert context["readout"].text == "IDLE"
        assert context["readout"].title == running

    def test_a_bad_reading_reads_as_one_pv_not_as_a_tally(self, spec, panel):
        running = spec.pvs.sequencer_running
        samples = {PvId(running): PvSample(name=running, ok=False, error="dead")}
        context = panel.widgets["sequencer_pill"].build(reader(samples))
        assert context["readout"].text == "PV DSC"
        assert "readings unusable" not in (context["readout"].title or "")
