"""The laser panel's config schema.

Every rule here exists because a real edit mistake got through once; the test
names say which. It is the one component with a schema this elaborate — the
generic components are covered by `test_components.py` — and it earns the
detail, because a laser panel's block is 180 lines of PV names that nobody can
proof-read by eye.
"""

from __future__ import annotations

import textwrap

import pytest
import yaml
from pydantic import ValidationError

from components.laser_panel.config import Config

MINIMAL = """
    component: laser-panel
    id: NL2
    pvs:
      connection: L4:NL2:CONN
      fullPower: L4:NL2:FULLP
      shutter: L4:NL2:SHUT
      phdMean: L4:NL2:PHD1
      regenState: L4:NL2:REGEN:State
      regenTemp: L4:NL2:REGEN:T
      phd2Mean: L4:NL2:PHD2
      attenuator: L4:NL2:ATT
      loadedWaveform: L4:NL2:WF
    triggerDelay: [L4:NL2:DELAY1]
    mss: []
    moduleErrors: []
    chillers: []
    flashlamps: []
    modbox: []
    delayPresets: [50]
    commands:
      START_LASER: START_LASER
"""


def parse(text: str) -> Config:
    return Config.model_validate(yaml.safe_load(textwrap.dedent(text)))


def test_a_minimal_laser_parses():
    laser = parse(MINIMAL)
    assert laser.laser == "NL2"
    assert laser.can("START_LASER")
    assert not laser.can("STOP_LASER")


class TestCommands:
    def test_a_placeholder_falls_back_to_the_assembled_command_pv(self):
        target = parse(MINIMAL).resolve_command("START_LASER")
        assert (target.pv_name, target.value) == ("CMD_NL2_START_LASER", 1)

    def test_a_real_pv_is_written_directly_with_its_value(self):
        laser = parse(
            MINIMAL.replace(
                "      START_LASER: START_LASER",
                "      START_LASER: START_LASER\n"
                "      MODBOX_OFF: {pv: L4:NL2:ModBox:Awake, value: Sleep}",
            )
        )
        target = laser.resolve_command("MODBOX_OFF")
        assert (target.pv_name, target.value) == ("L4:NL2:ModBox:Awake", "Sleep")

    def test_a_target_that_is_neither_placeholder_nor_pv_is_rejected(self):
        # `ALIGNMENT_MODE: SetAlignmentMode` used to reach the write path
        # verbatim.
        with pytest.raises(ValidationError, match="neither the placeholder"):
            parse(MINIMAL.replace("START_LASER: START_LASER", "ALIGNMENT_MODE: SetAlignmentMode"))

    def test_an_operator_valued_command_may_not_configure_a_value(self):
        with pytest.raises(ValidationError, match="takes its value from the operator"):
            parse(
                MINIMAL.replace(
                    "      START_LASER: START_LASER",
                    "      SET_DELAY: {pv: L4:NL2:SETDELAY, value: 700}",
                )
            )

    def test_an_unknown_command_is_rejected(self):
        with pytest.raises(ValidationError, match="unknown command"):
            parse(MINIMAL.replace("START_LASER: START_LASER", "WARP_CORE: WARP_CORE"))

    def test_two_commands_may_share_a_pv_when_they_write_different_values(self):
        laser = parse(
            MINIMAL.replace(
                "      START_LASER: START_LASER",
                "      MODBOX_ON: {pv: L4:NL2:Mode, value: Awake}\n"
                "      MODBOX_OFF: {pv: L4:NL2:Mode, value: Sleep}",
            )
        )
        assert laser.resolve_command("MODBOX_ON").value == "Awake"

    def test_a_value_must_be_something_caput_can_take(self):
        with pytest.raises(ValidationError, match="non-empty string or a number"):
            parse(
                MINIMAL.replace(
                    "      START_LASER: START_LASER",
                    "      MODBOX_OFF: {pv: L4:NL2:Mode, value: [1, 2]}",
                )
            )

    def test_a_missing_command_hides_its_button_with_no_fail_open_default(self):
        laser = parse(MINIMAL)
        assert not laser.can("MODBOX_ON")
        assert laser.command_names == ("START_LASER",)


class TestDuplicates:
    def test_two_signals_on_one_pv_are_rejected(self):
        with pytest.raises(ValidationError, match="duplicate PV name"):
            parse(MINIMAL.replace("phd2Mean: L4:NL2:PHD2", "phd2Mean: L4:NL2:PHD1"))

    def test_a_command_shorthand_pointing_at_a_readout_is_a_duplicate(self):
        # The exact copy-paste typo the rule exists for: a button that would
        # write 1 to the full-power readout.
        with pytest.raises(ValidationError, match="duplicate PV name"):
            parse(
                MINIMAL.replace(
                    "      START_LASER: START_LASER",
                    "      SYSTEM_STANDBY: L4:NL2:FULLP",
                )
            )


class TestUnitsAndFormat:
    def test_an_unknown_signal_role_is_rejected(self):
        with pytest.raises(ValidationError, match="unknown signal role"):
            parse(MINIMAL + "    units:\n      thermalMass: kg\n")

    def test_a_blank_unit_is_a_slip_not_an_empty_unit(self):
        with pytest.raises(ValidationError, match="non-empty label"):
            parse(MINIMAL + "    units:\n      regenTemp: '   '\n")

    def test_an_out_of_range_format_is_rejected_at_load(self):
        with pytest.raises(ValidationError, match="between 0 and 100"):
            parse(MINIMAL + "    format:\n      regenTemp: {format: fixed, toFixed: -1}\n")

    def test_units_and_format_are_read_back_by_role(self):
        laser = parse(
            MINIMAL + "    units:\n      regenTemp: degC\n    format:\n      regenTemp: 1\n"
        )
        assert laser.unit("regenTemp") == "degC"
        assert laser.value_format("regenTemp").to_fixed == 1


class TestStrictness:
    def test_an_unknown_key_is_rejected(self):
        with pytest.raises(ValidationError):
            parse(MINIMAL + "    mystery: 1\n")

    def test_a_whitespace_only_pv_name_is_rejected(self):
        with pytest.raises(ValidationError):
            parse(MINIMAL.replace("shutter: L4:NL2:SHUT", "shutter: '   '"))

    def test_an_empty_trigger_delay_list_is_rejected(self):
        with pytest.raises(ValidationError):
            parse(MINIMAL.replace("triggerDelay: [L4:NL2:DELAY1]", "triggerDelay: []"))
