"""Every component, checked the way a controls engineer will meet it.

Two kinds of test here. The first walks the registry and holds every component
to the contract, so a new one cannot arrive half-wired — that is what keeps the
promise that a YAML-only screen works against the simulator and the local IOC.
The second exercises each component's own judgements.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from core.components import Component, PvReader, PvSpec, registry, slug
from core.epics import Datatype, PvId, PvSample
from core.jinja import create_environment

#: The app root, for the two tests that read the stylesheet itself.
ROOT = Path(__file__).resolve().parent.parent


def build(name: str, **block) -> Component:
    """One component, configured as YAML would."""
    cls = registry()[name]
    config = cls.Config.model_validate({"component": name, **block})
    return cls(key=f"{slug(name)}1", config=config)


def reader(samples: dict[PvId, PvSample | None], connected: bool = True) -> PvReader:
    return PvReader(samples, connected)


def ok(name: str, value, severity: int = 0) -> PvSample:
    return PvSample(name=name, ok=True, value=value, severity=severity, timestamp=1.0)


# ---------------------------------------------------------------------------
# The contract
# ---------------------------------------------------------------------------

ALL = sorted(registry())


def test_the_registry_is_not_empty():
    assert ALL, "importing `components` should have registered every component"


@pytest.mark.parametrize("name", ALL)
class TestContract:
    def test_it_names_itself_and_its_template(self, name):
        cls = registry()[name]
        assert cls.name == name
        assert cls.template, f"{name} has no template"
        assert cls.summary, f"{name} has no one-line summary"

    def test_its_template_exists(self, name):
        env = create_environment()
        env.get_template(registry()[name].template)

    def test_its_config_rejects_unknown_keys(self, name):
        """A typo must fail at start-up naming the keys that would have worked,
        rather than rendering a screen with something quietly missing."""
        cls = registry()[name]
        assert cls.Config.model_config.get("extra") == "forbid"

    def test_every_config_field_is_documented(self, name):
        """The field descriptions are the component's documentation as far as a
        controls engineer is concerned — they are what the error message and the
        generated reference show."""
        cls = registry()[name]
        undocumented = [
            field
            for field, info in cls.Config.model_fields.items()
            if field not in ("component", "id", "title") and not info.description
        ]
        assert not undocumented, f"{name}: undocumented fields {undocumented}"


class TestPvCoverage:
    """Every PV a component reads must also be declared.

    This is the load-bearing test of the whole design: the declaration is what
    the simulator invents values from and what `ioc/generate.py` turns into a
    record. A component that reads an undeclared PV works against the real
    network and shows `<>` for ever anywhere else, which is the kind of bug
    found late and in the worst place.
    """

    CASES = {
        "value": {"label": "A", "pv": "X:A"},
        "group": {"label": "G", "items": [{"label": "i", "pv": "X:I"}]},
        "grid": {
            "columns": [{"key": "a", "label": "A"}],
            "rows": [{"label": "r", "a": "X:R"}],
        },
        "tally": {
            "states": ["SB", "RUN"],
            "channels": [{"label": "c", "pv": "X:C"}],
        },
        "motor": {"label": "M", "readback": "X:M:RBV", "setpoint": "X:M:VAL"},
        "valve": {"label": "V", "pv": "X:V:State"},
        "panel": {"title": "P"},
    }

    @pytest.mark.parametrize("name", sorted(CASES))
    def test_declares_what_it_reads(self, name):
        component = build(name, **self.CASES[name])
        declared = {spec.name for spec in component.all_pv_specs()}
        read = {pv.name for pv in component.all_pvs()}
        assert not read - declared, f"{name} reads undeclared {sorted(read - declared)}"

    @pytest.mark.parametrize("name", sorted(CASES))
    def test_widget_ids_are_prefixed_by_the_component(self, name):
        """Two instances of one component on a screen must not collide: the id
        is what an SSE patch targets."""
        component = build(name, **self.CASES[name])
        for widget in component.all_widgets():
            assert widget.id.startswith(component.key)


# ---------------------------------------------------------------------------
# Individual judgements
# ---------------------------------------------------------------------------


class TestValue:
    def test_a_number_carries_its_unit_and_format(self):
        component = build("value", label="Flow", pv="X:F", units="l/min", format=1)
        readout = component.widgets["value"].build(reader({PvId("X:F"): ok("X:F", 12.34)}))["readout"]
        assert readout.text == "12.3"
        assert readout.units == "l/min"

    def test_an_enum_is_read_by_name_not_by_index(self):
        """A record read at its native type delivers the index, which is how a
        status row ends up showing `2` where it should say STANDBY."""
        component = build("value", label="State", pv="X:S", kind="enum", states=["A", "B"])
        assert PvId("X:S", Datatype.ENUM_STRING) in component.all_pvs()

    def test_a_bool_that_is_neither_0_nor_1_is_not_a_confident_no(self):
        component = build("value", label="B", pv="X:B", kind="bool", on_text="YES", off_text="NO")
        readout = component.widgets["value"].build(reader({PvId("X:B"): ok("X:B", 2)}))["readout"]
        assert readout.text == "<>"

    def test_good_on_makes_the_on_state_green(self):
        component = build("value", label="B", pv="X:B", kind="bool", good="on")
        readout = component.widgets["value"].build(reader({PvId("X:B"): ok("X:B", 1)}))["readout"]
        assert readout.tone == "positive-important"

    def test_the_range_becomes_the_simulated_band(self):
        component = build("value", label="F", pv="X:F", range=(11, 16))
        spec = component.pv_specs()[0]
        assert (spec.low, spec.high) == (11.0, 16.0)
        assert spec.step > 0, "a reading with a range should drift"

    def test_alarm_limits_reach_the_declaration(self):
        component = build("value", label="F", pv="X:F", range=(0, 10), alarm={"hihi": 9})
        assert component.pv_specs()[0].hihi == 9

    def test_a_button_pointing_elsewhere_declares_that_pv_too(self):
        component = build(
            "value",
            label="B",
            pv="X:B",
            kind="bool",
            actions=[{"label": "Open", "value": 1, "pv": "X:B:CMD"}],
        )
        assert {spec.name for spec in component.pv_specs()} == {"X:B", "X:B:CMD"}

    def test_yaml_booleans_in_state_names_are_explained(self):
        """`states: [OFF, ON]` arrives as `[False, True]` — YAML 1.1. The error
        has to say so, or it reads as "this config has arbitrary rules"."""
        with pytest.raises(ValueError, match="YAML read one of these as a boolean"):
            build("value", label="S", pv="X:S", kind="enum", states=[False, "COOLING"])

    def test_good_on_survives_yaml_reading_it_as_true(self):
        component = build("value", label="B", pv="X:B", kind="bool", good=True)
        assert component.config.good == "on"

    def test_value_text_keys_may_be_written_as_numbers(self):
        component = build("value", label="B", pv="X:B", kind="bool", values={0: "SHUT", 1: "OPEN"})
        readout = component.widgets["value"].build(reader({PvId("X:B"): ok("X:B", 0)}))["readout"]
        assert readout.text == "SHUT"


class TestGroup:
    def _group(self, mode: str, **extra):
        return build(
            "group",
            label="G",
            mode=mode,
            items=[{"label": "a", "pv": "X:A"}, {"label": "b", "pv": "X:B"}],
            **extra,
        )

    def test_permissions_read_yes_only_when_all_are_granted(self):
        component = self._group("permissions")
        samples = {PvId("X:A"): ok("X:A", 1), PvId("X:B"): ok("X:B", 1)}
        assert component.widgets["pill"].build(reader(samples))["readout"].text == "YES"
        samples[PvId("X:B")] = ok("X:B", 0)
        assert component.widgets["pill"].build(reader(samples))["readout"].text == "NO"

    def test_a_denied_permission_is_not_coloured_by_the_screen(self):
        """If a failed permission is genuinely an alarm, the IOC says so.
        Absence of green is the signal."""
        component = self._group("permissions")
        samples = {PvId("X:A"): ok("X:A", 1), PvId("X:B"): ok("X:B", 0)}
        assert component.widgets["pill"].build(reader(samples))["readout"].tone is None

    def test_an_alarmed_item_cannot_read_yes_in_green(self):
        component = self._group("permissions")
        samples = {PvId("X:A"): ok("X:A", 1), PvId("X:B"): ok("X:B", 1, severity=2)}
        assert component.widgets["pill"].build(reader(samples))["readout"].tone == "error"

    def test_states_count_what_is_on(self):
        component = self._group("states")
        samples = {PvId("X:A"): ok("X:A", 1), PvId("X:B"): ok("X:B", 0)}
        assert component.widgets["pill"].build(reader(samples))["readout"].text == "1/2"

    def test_codes_count_what_is_not_the_ok_code(self):
        component = self._group("codes")
        samples = {PvId("X:A"): ok("X:A", "0000"), PvId("X:B"): ok("X:B", "0021")}
        assert component.widgets["pill"].build(reader(samples))["readout"].text == "1/2"

    def test_the_expanded_list_translates_a_bit_into_words(self):
        component = self._group("permissions")
        samples = {PvId("X:A"): ok("X:A", 1), PvId("X:B"): ok("X:B", 0)}
        items = component.widgets["list"].build(reader(samples))["items"]
        assert [item.text for item in items] == ["YES", "NO"]


class TestGrid:
    def _grid(self):
        return build(
            "grid",
            columns=[
                {"key": "flow", "label": "Flow", "units": "l/min", "range": (10, 20)},
                {"key": "temp", "label": "Temp", "units": "degC"},
            ],
            rows=[
                {"label": "one", "flow": "X:1:F", "temp": "X:1:T"},
                {"label": "two", "flow": "X:2:F"},
            ],
        )

    def test_a_row_may_leave_a_column_out(self):
        """A blank reads as "not applicable"; a placeholder would read as
        "broken"."""
        table = self._grid().context()["table"]
        assert table[1]["cells"][1] is None

    def test_the_unit_is_in_the_header_not_in_every_cell(self):
        component = self._grid()
        readout = component.widgets["0-flow"].build(reader({PvId("X:1:F"): ok("X:1:F", 12.0)}))[
            "readout"
        ]
        assert readout.units is None
        assert component.config.columns[0].header == "Flow (l/min)"

    def test_a_row_naming_an_unknown_column_is_refused(self):
        with pytest.raises(ValueError, match="not a column"):
            build(
                "grid",
                columns=[{"key": "flow", "label": "Flow"}],
                rows=[{"label": "one", "flow": "X:F", "pressure": "X:P"}],
            )

    def test_demo_is_per_column_because_a_fault_is_a_fault_of_one_reading(self):
        component = build(
            "grid",
            columns=[
                {"key": "flow", "label": "Flow", "range": (10, 20)},
                {"key": "temp", "label": "Temp", "range": (20, 25)},
            ],
            rows=[{"label": "one", "flow": "X:F", "temp": "X:T", "demo": {"temp": {"value": 99}}}],
        )
        specs = {spec.name: spec for spec in component.pv_specs()}
        assert specs["X:T"].value == 99
        assert specs["X:F"].value is None


class TestTally:
    def _tally(self, states=("SB", "RUN", "STOP")):
        return build(
            "tally",
            label="Lamps",
            states=list(states),
            aliases={"STANDBY": "SB", "STOPPED": "STOP"},
            channels=[
                {"label": "a", "pv": "X:A"},
                {"label": "b", "pv": "X:B"},
                {"label": "c", "pv": "X:C"},
            ],
        )

    def _read(self, values):
        return reader(
            {
                PvId(name, Datatype.ENUM_STRING): ok(name, value)
                for name, value in zip(("X:A", "X:B", "X:C"), values)
            }
        )

    def test_aliases_map_a_long_state_name_onto_a_narrow_column(self):
        counts = self._tally()._counts(self._read(["STANDBY", "RUN", "STOPPED"]))["counts"]
        assert counts == {"SB": 1, "RUN": 1, "STOP": 1}

    def test_a_state_with_no_column_is_counted_nowhere(self):
        """And is still shown by name in the expanded list: an unexpected state
        must not vanish."""
        counts = self._tally()._counts(self._read(["IGNITION", "RUN", "RUN"]))["counts"]
        assert sum(counts.values()) == 2

    def test_an_unusable_reading_is_not_counted_and_says_why(self):
        component = self._tally()
        read = reader(
            {
                PvId("X:A", Datatype.ENUM_STRING): ok("X:A", "RUN"),
                PvId("X:B", Datatype.ENUM_STRING): PvSample(name="X:B", ok=False, error="dead"),
                PvId("X:C", Datatype.ENUM_STRING): ok("X:C", "RUN"),
            }
        )
        context = component._counts(read)
        assert context["counts"]["RUN"] == 2
        assert "no usable reading" in context["title"]

    def test_an_alias_onto_a_column_that_does_not_exist_is_refused(self):
        with pytest.raises(ValueError, match="not columns"):
            build(
                "tally",
                states=["SB"],
                aliases={"RUNNING": "RUN"},
                channels=[{"label": "a", "pv": "X:A"}],
            )


class TestMotor:
    def test_the_prefix_form_follows_the_motor_record(self):
        component = build("motor", label="M", prefix="L4-MOT-M1")
        names = {spec.name for spec in component.pv_specs()}
        assert "L4-MOT-M1.RBV" in names
        assert "L4-MOT-M1.DMOV" in names

    def test_dmov_is_inverted_because_it_means_done_moving(self):
        component = build("motor", label="M", prefix="L4-MOT-M1")
        assert component.config.inverted
        read = reader({PvId("L4-MOT-M1.DMOV"): ok("L4-MOT-M1.DMOV", 1)})
        assert component.widgets["state"].build(read)["readout"].text == "STOPPED"

    def test_an_explicit_moving_flag_is_not_inverted(self):
        component = build("motor", label="M", readback="X:M:P", moving="X:M:Moving")
        read = reader({PvId("X:M:Moving"): ok("X:M:Moving", 1)})
        assert component.widgets["state"].build(read)["readout"].text == "MOVING"

    def test_a_limit_wins_over_movement(self):
        """A motor sitting on a limit switch is the thing to know about, and it
        is not going anywhere."""
        component = build(
            "motor",
            label="M",
            readback="X:M:P",
            moving="X:M:Moving",
            limits=("X:M:LL", "X:M:HL"),
        )
        read = reader(
            {PvId("X:M:Moving"): ok("X:M:Moving", 1), PvId("X:M:HL"): ok("X:M:HL", 1)}
        )
        assert component.widgets["state"].build(read)["readout"].text == "AT LIMIT"

    def test_writing_the_setpoint_moves_the_readback(self):
        component = build("motor", label="M", readback="X:M:P", setpoint="X:M:T", moving="X:M:Moving")
        setpoint = next(spec for spec in component.pv_specs() if spec.name == "X:M:T")
        assert setpoint.command
        assert ("X:M:P", None) in setpoint.effects
        assert setpoint.busy == ("X:M:Moving",)

    def test_a_position_does_not_wander_on_its_own(self):
        """A motor at rest is at rest. A simulator that drifted it would teach
        an engineer that a moving number means a live machine."""
        component = build("motor", label="M", readback="X:M:P", range=(0, 10))
        position = next(spec for spec in component.pv_specs() if spec.name == "X:M:P")
        assert position.step == 0

    def test_it_needs_either_a_prefix_or_a_readback(self):
        with pytest.raises(ValueError, match="either `prefix:`"):
            build("motor", label="M")

    def test_prefix_and_explicit_pvs_together_are_refused(self):
        with pytest.raises(ValueError, match="not both"):
            build("motor", label="M", prefix="X:M", readback="X:M:P")


class TestValve:
    def test_a_command_pv_drives_the_state_record(self):
        component = build(
            "valve", label="V", pv="X:V:State", open_pv="X:V:Open", close_pv="X:V:Close"
        )
        specs = {spec.name: spec for spec in component.pv_specs()}
        assert specs["X:V:Open"].command
        assert specs["X:V:Open"].effects == (("X:V:State", 1),)
        assert specs["X:V:Close"].effects == (("X:V:State", 0),)

    def test_without_command_pvs_the_buttons_write_the_state_directly(self):
        component = build("valve", label="V", pv="X:V:State")
        assert component.context()["open_target"] == ("X:V:State", 1)


class TestRowLayout:
    """How wide a value is, is a design decision — and one worth a test.

    A reading occupies a fixed field; it does not stretch to the end of its row.
    Stretching made a one-word state ("YES") a box the width of the panel, which
    read as emphasis nobody meant, and it left every reading in a card a
    different width, so a column could not be scanned down. Two rules enforce
    it, one in the stylesheet and one in the row macro, and each of them is easy
    to undo by accident.
    """

    @staticmethod
    def stylesheet() -> str:
        return (ROOT / "core" / "static" / "css" / "hmi.css").read_text()

    def test_a_card_declares_a_fixed_value_field(self):
        assert "--hmi-value-width:" in self.stylesheet()

    def test_a_row_has_no_stretching_track(self):
        """The row's tracks must add up to LESS than the row: no `1fr` on the
        value column, or the value fills whatever is left again."""
        css = self.stylesheet()
        rule = css[css.index("\n.row {") : css.index("\n.row[data-has-action")]
        assert "minmax(0, var(--hmi-value-width, 1fr))" in rule
        assert "minmax(0, 1fr)" not in rule

    def test_a_row_can_ask_for_the_rest_of_the_card(self):
        """The escape hatch for a cell that carries more than one reading."""
        css = self.stylesheet()
        assert ".row[data-value='wide']" in css
        rows = (ROOT / "components" / "templates" / "rows.html").read_text()
        assert 'data-value="wide"' in rows

    def test_a_value_component_passes_the_flag_through(self):
        """`wide: true` in a zone's YAML has to reach the markup, or the screen
        author's only recourse is editing the stylesheet."""
        component = build("value", label="V", pv="X:V", wide=True)
        assert component.config.wide is True

    def test_a_column_header_wraps_rather_than_colliding(self):
        """A header wider than its column used to overflow its grid track and
        print on top of its neighbour — "Flow (l/min)" and "Temp (degC)" became
        one illegible word in a 22rem panel."""
        css = self.stylesheet()
        rule = css[css.index("\n.col-header {") :][: css[css.index("\n.col-header {") :].index("}")]
        assert "white-space: nowrap" not in rule
        assert "overflow-wrap: normal" in rule
