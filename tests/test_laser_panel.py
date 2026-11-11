"""The laser panel: the judgements in `readings.py`, and the reverse index that
decides what an SSE patch contains.

The one bespoke component, so the one with bespoke tests. Everything here is a
rule an operator's reading of the screen depends on.
"""

from __future__ import annotations

import asyncio

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


class TestRegistersReachTheBackends:
    """A register the screen can show is a PV the simulator invents and the
    generated IOC serves. Declared once by the component, as every other PV
    is — otherwise the tree is a screen you can only develop against hardware.
    """

    def panel_with_modules(self, zone):
        from components.laser_panel.config import Module, Register

        module = Module.model_validate(
            {
                "label": "PS1225:11",
                "prefix": "L4-OPCPA-NL2:PS1225:11",
                "registers": [
                    # Not `ErrorCode`: the overview already declares that PV,
                    # so it would pass this test without the tree declaring it.
                    {"name": "T_out", "label": "Outlet temp"},
                    {"name": "SetPoint", "label": "Setpoint", "write": True},
                ],
            }
        )
        return build_panel(zone, modules=[module])

    def test_every_register_is_declared(self, zone):
        panel = self.panel_with_modules(zone)
        declared = {spec.name for spec in panel.pv_specs()}
        assert "L4-OPCPA-NL2:PS1225:11:T_out" in declared
        assert "L4-OPCPA-NL2:PS1225:11:SetPoint" in declared


class TestARegisterCanBeWrittenWithoutHardware:
    """A setpoint is written to `<register>:W`, so that record has to exist
    wherever the screen runs — or Confirm appears to work in dev and moves
    nothing, which is the worst way for a control to fail."""

    async def test_writing_the_setpoint_moves_the_readback(self, zone):
        import asyncio

        from core.epics.sim_backend import SimBackend, seed_from_specs

        backend = SimBackend(tick_seconds=10, seed=1)
        seed_from_specs(backend, [s for g in zone.guis for s in g.all_pv_specs()])
        readback = "L4-OPCPA-NL2:PS1225:11:SetPoint"

        assert backend.spec(f"{readback}:W") is not None, "nothing serves the write"
        await backend.start()
        try:
            await backend.caput(f"{readback}:W", 21)
            await asyncio.sleep(0.05)
            assert backend.spec(readback).value == 21
        finally:
            await backend.stop()


class TestADeclarationlessRegister:
    """A real zone declares a name, a label and whether it is writable. The
    range and the states are the device's, read when the register is selected
    — so a register that declares neither must offer no range at all, rather
    than one this screen made up."""

    async def test_no_range_means_no_range(self, zone):
        from core.epics.sim_backend import SimBackend, seed_from_specs
        from core.epics.types import PvId
        from components.laser_panel.config import Module

        module = Module.model_validate(
            {
                "label": "PS9999:01",
                "prefix": "L4-OPCPA-NL2:PS9999:01",
                "registers": [{"name": "Bare", "label": "Bare", "write": True}],
            }
        )
        panel = build_panel(zone, modules=[module])
        backend = SimBackend(tick_seconds=10, seed=1)
        seed_from_specs(backend, panel.pv_specs())
        described = await backend.describe(PvId("L4-OPCPA-NL2:PS9999:01:Bare"))
        assert described.low is None and described.high is None, (
            f"a range nobody declared: {described}"
        )


class TestARegistersKindDecidesHowItIsRead:
    """A register says what it is, and that one word decides the datatype it
    is monitored at.

    A tree is the generic case — hundreds of records of every type under one
    heading — so the type is declared rather than discovered: the subscription
    has to be right before the first reading arrives, and an enum read at its
    native type delivers an index where the row should say RUN.
    """

    def tree_for(self, zone, **register):
        from components.laser_panel.config import Module

        module = Module.model_validate(
            {
                "label": "PS9999:01",
                "prefix": "L4-OPCPA-NL2:PS9999:01",
                "registers": [{"name": "Mode", "label": "Mode", **register}],
            }
        )
        return build_panel(zone, modules=[module]).detail().components[0]

    def datatype_of(self, tree, pv: str):
        widget = next(
            w for w in tree.widgets.values() if any(p.name == pv for p in w.pvs)
        )
        return next(p.datatype for p in widget.pvs if p.name == pv)

    def test_an_enum_is_read_by_name(self, zone):
        from core.epics.types import Datatype

        tree = self.tree_for(zone, kind="enum", states=["STANDBY", "RUN"])
        pv = "L4-OPCPA-NL2:PS9999:01:Mode"
        assert self.datatype_of(tree, pv) is Datatype.ENUM_STRING

    def test_a_two_state_record_is_read_by_name_too(self, zone):
        """A bi/bo record names its states (ZNAM/ONAM) exactly as an mbbi
        does — so it is read by name, and the row says what the record calls
        the state, not ON/OFF chosen by this screen."""
        from core.epics.types import Datatype

        tree = self.tree_for(zone, kind="bool", states=["Closed", "Open"])
        pv = "L4-OPCPA-NL2:PS9999:01:Mode"
        assert self.datatype_of(tree, pv) is Datatype.ENUM_STRING
        assert self.row(tree, pv, "Open") == "Open"

    def test_anything_numeric_is_read_as_a_number(self, zone):
        """Whatever record the device used — ai, longin, calc — the tree asks
        for a number, so one column of readings is one kind of value."""
        from core.epics.types import Datatype

        tree = self.tree_for(zone)
        pv = "L4-OPCPA-NL2:PS9999:01:Mode"
        assert self.datatype_of(tree, pv) is Datatype.NUMBER

    def row(self, tree, pv, value):
        """What the tree's row for this register reads."""
        from core.components import PvReader, PvSample
        from core.epics.types import PvId

        widget = next(
            w for w in tree.widgets.values() if any(p.name == pv for p in w.pvs)
        )
        pv_id = next(p for p in widget.pvs if p.name == pv)
        sample = PvSample(name=pv, ok=True, value=value, timestamp=1.0)
        return widget.build(PvReader({pv_id: sample}, True))["readout"].text

    def test_the_name_arrives_with_the_reading(self, zone):
        """No index to translate and no second answer to wait for: the row
        reads RUN from the first monitor update, not after a description
        landed."""
        tree = self.tree_for(zone, kind="enum", states=["STANDBY", "RUN"])
        assert self.row(tree, "L4-OPCPA-NL2:PS9999:01:Mode", "RUN") == "RUN"


class TestTheNvCheckboxIsTheWholeControl:
    """One element: the box is ticked when the device is armed, follows the
    PV's monitor, and ticks the moment it is pressed. No separate indicator —
    the only thing worth saying beside it is that a write failed."""

    NV = "L4-OPCPA-NL2:NVWriteEnable"

    @pytest.fixture
    def detail(self):
        from core.page import build_pages

        zone = load_zone("TESTZ")
        page = build_pages(zone, create_environment())["l4-opcpa/NL2/registers"]
        return page, page.gui.components[0]

    def draw(self, detail, sample) -> str:
        page, tree = detail
        return str(page.render_widget(tree.widgets["nv"], reader({PvId(self.NV): sample})))

    def box(self, detail, sample) -> dict[str, str | None]:
        """The checkbox's attributes, parsed — so `checked` means the
        attribute, not the word appearing in its click handler."""
        from html.parser import HTMLParser

        found: dict[str, str | None] = {}

        class Inputs(HTMLParser):
            def handle_starttag(self, tag, attrs):
                if tag == "input" and not found:
                    found.update(attrs)

        Inputs().feed(self.draw(detail, sample))
        return found

    def test_there_is_no_separate_indicator(self, detail):
        markup = self.draw(detail, ok(self.NV, 0))
        assert 'type="checkbox"' in markup
        assert "nv-state" not in markup, "the indicator chip is still drawn"

    def test_the_box_follows_the_device(self, detail):
        assert "checked" in self.box(detail, ok(self.NV, 1))
        assert "checked" not in self.box(detail, ok(self.NV, 0))

    def test_a_press_writes_what_the_box_now_shows(self, detail):
        """From the box at the moment of the press, not from what the server
        last drew: a second press before the device confirms the first must
        write the opposite, not the same value again."""
        markup = self.draw(detail, ok(self.NV, 0))
        assert "el.checked" in markup, "the value written is fixed at render time"

    def test_the_box_keeps_its_attribute_in_step(self, detail):
        """Datastar's morph only corrects `checked` when the *attribute*
        differs between the drawn box and the redraw. A press flips the
        property alone, so without this a refused write redraws the same
        attribute and the box stays wrong."""
        markup = self.draw(detail, ok(self.NV, 0))
        assert "toggleAttribute('checked'" in markup

    def test_a_pv_that_cannot_be_read_disables_the_box(self, detail):
        """Without the chip there is nothing else to say PV DSC — and an
        unticked box that can still be pressed reads as 'volatile', which is
        the dangerous way to be wrong about whether a write is permanent."""
        from core.epics.types import PvSample

        lost = PvSample(name=self.NV, ok=False, error="disconnected", severity=3)
        assert "disabled" in self.box(detail, lost)
        assert "checked" not in self.box(detail, lost)
        assert "disabled" not in self.box(detail, ok(self.NV, 0))

    def test_an_invalid_pv_can_still_be_written(self, detail):
        """A write PV is processed only when it is written, so a write is the
        one thing that clears its severity. One that has never been written
        since the IOC started is UDF and INVALID — and disabling the box for
        that would leave it so for good."""
        from core.epics.types import PvSample

        for status, value in ((17, 0), (17, 1)):  # UDF, as an IOC reports it
            invalid = PvSample(
                name=self.NV, ok=True, value=value, severity=3, status=status, timestamp=1.0
            )
            box = self.box(detail, invalid)
            assert "disabled" not in box, "an INVALID write PV cannot be written again"
            assert ("checked" in box) == (value == 1), "the box does not show the value"

    def test_a_failure_is_reported_outside_the_box_s_own_element(self, detail):
        """The write names a status line to report into, and that line is not
        part of the widget — the redraw that puts the box right after a
        failure would otherwise wipe the message that explains it."""
        page, tree = detail
        markup = self.draw(detail, ok(self.NV, 0))
        assert f"status={tree.nv_status}" in markup
        assert f'id="{tree.nv_status}"' not in markup


class TestARegistersUnitIsTheDevices:
    """A register's unit is the record's EGU, read from its control fields at
    start-up — not the zone file's. A `units:` in the YAML is what the
    simulator answers that read with, and a real zone leaves it out."""

    PV = "L4-OPCPA-NL2:PS9999:01:Temp"

    def tree_for(self, zone, **register):
        from components.laser_panel.config import Module

        module = Module.model_validate(
            {
                "label": "PS9999:01",
                "prefix": "L4-OPCPA-NL2:PS9999:01",
                "registers": [{"name": "Temp", "label": "Temp", **register}],
            }
        )
        return build_panel(zone, modules=[module]).detail().components[0]

    def row(self, tree, value) -> str:
        from core.components import PvReader, PvSample

        widget = next(
            w for w in tree.widgets.values() if any(p.name == self.PV for p in w.pvs)
        )
        pv_id = next(p for p in widget.pvs if p.name == self.PV)
        sample = PvSample(name=self.PV, ok=True, value=value, timestamp=1.0)
        readout = widget.build(PvReader({pv_id: sample}, True))["readout"]
        return f"{readout.text} {readout.units or ''}"

    def test_the_tree_asks_about_every_register(self, zone):
        assert self.PV in self.tree_for(zone).describes()

    def test_a_string_is_not_asked_about(self, zone):
        """A string record has no control fields — DBR_CTRL_STRING carries
        the value and its alarm state, nothing else — so asking costs a read
        and answers nothing."""
        assert self.PV not in self.tree_for(zone, kind="string").describes()

    def test_the_row_shows_the_unit_the_device_reports(self, zone):
        from core.epics.types import PvDescription

        tree = self.tree_for(zone, units="°C")
        tree.described({self.PV: PvDescription(units="K")})
        row = self.row(tree, 296.5)
        assert "K" in row, f"the device's unit is not shown: {row!r}"
        assert "°C" not in row, f"the zone file's unit is shown instead: {row!r}"

    def test_a_record_that_has_not_answered_shows_no_unit(self, zone):
        """Not the zone file's as a stand-in: two sources for one unit is how
        a screen comes to show °C for a record that reads in K."""
        tree = self.tree_for(zone, units="°C")
        assert "°C" not in self.row(tree, 296.5)


class TestAChannelThatComesBackIsDescribedAgain:
    """A module powered down at start-up answers nothing about its records.
    When its channel comes back it is asked again — and the row is drawn
    again with the answer, because the reading itself may well be the same
    one it had before, and a static setpoint would otherwise wait for its
    next change to show its unit."""

    T_OUT = "L4-OPCPA-NL2:PS1225:11:T_out"

    async def test_the_row_is_redrawn_with_what_the_record_now_says(self):
        from core.epics.hub import PvHub
        from core.epics.sim_backend import SimBackend
        from core.epics.types import PvDescription, PvSample
        from core.page import build_pages, describe_on_reconnect

        zone = load_zone("TESTZ")
        pages = build_pages(zone, create_environment())
        detail = pages["l4-opcpa/NL2/registers"]
        backend = SimBackend(tick_seconds=60, seed=1)

        async def kelvin(pv):
            return PvDescription(units="K")

        backend.describe = kelvin
        hub = PvHub(backend)
        await hub.start()
        try:
            describe_on_reconnect(hub, pages)
            pv = next(p for p in detail.all_pvs if p.name == self.T_OUT)
            watching = await hub.subscribe(detail.all_pvs)
            hub._on_sample(pv, PvSample(name=self.T_OUT, ok=True, value=23.0, timestamp=1.0))
            hub._on_sample(pv, PvSample(name=self.T_OUT, ok=False, error="disconnected"))
            hub._on_sample(pv, PvSample(name=self.T_OUT, ok=True, value=23.0, timestamp=2.0))
            watching.drain()  # what the reconnect itself woke

            await asyncio.sleep(0.05)  # the record is asked, and answers

            assert pv in watching.drain(), "the answer arrived and nothing was redrawn"
            patch = detail.render_patch(PvReader(hub.snapshot(detail.all_pvs), True), [pv])
            assert "K" in patch, patch
            await watching.close()
        finally:
            await hub.stop()


class TestARegistersKindDecidesWhatItsWriteTakes:
    """The same word that chose the datatype chooses the write rule — and the
    field the operator types into, which is built from that rule."""

    def rule_for(self, zone, kind, described=None):
        from components.laser_panel.config import Module
        from core.epics.types import PvDescription

        module = Module.model_validate(
            {
                "label": "PS9999:01",
                "prefix": "L4-OPCPA-NL2:PS9999:01",
                "registers": [{"name": "R", "kind": kind, "write": True}],
            }
        )
        tree = build_panel(zone, modules=[module]).detail().components[0]
        item = tree.register("L4-OPCPA-NL2:PS9999:01:R")
        return tree.write_rule(item, described or PvDescription(low=0, high=3000))

    def test_an_int_register_takes_whole_numbers(self, zone):
        rule = self.rule_for(zone, "int")
        assert rule.kind == "integer"
        assert (rule.min, rule.max) == (0, 3000), "the device's limits are lost"

    def test_a_float_register_takes_numbers(self, zone):
        assert self.rule_for(zone, "float").kind == "number"

    def test_a_string_register_takes_text(self, zone):
        """Not a number with no bounds: that refused every word written to a
        string register."""
        assert self.rule_for(zone, "string").kind == "text"

    def test_a_string_register_gets_a_field_that_takes_words(self, zone):
        """The numeric field greys Confirm out while its text is not a
        number — which, for a string register, is always."""
        from components.laser_panel.config import Module
        from core.epics.types import PvDescription

        module = Module.model_validate(
            {
                "label": "PS9999:01",
                "prefix": "L4-OPCPA-NL2:PS9999:01",
                "registers": [{"name": "Note", "kind": "string", "write": True}],
            }
        )
        tree = build_panel(zone, modules=[module]).detail().components[0]
        item = tree.register("L4-OPCPA-NL2:PS9999:01:Note")
        markup = create_environment().get_template("register_tree/write_panel.html").render(
            comp=tree,
            c=tree.config,
            register=item,
            described=PvDescription(),
            rule=tree.write_rule(item, PvDescription()),
            nv="",
        )
        assert 'class="preset-field"' in markup
        assert "isNaN" not in markup, "Confirm is held dead until the text is a number"
        assert "preventDefault" not in markup, "keys are blocked in a text field"
        assert 'inputmode="decimal"' not in markup
