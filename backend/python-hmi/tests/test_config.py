"""The config schema. Every rule here exists because a real edit mistake got
through once; the test names say which.
"""

from __future__ import annotations

import textwrap

import pytest

from app.modules.l4_opcpa.config import ConfigError, parse_laser_specs

MINIMAL = """
lasers:
  - id: NL2
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


def parse(text: str):
    return parse_laser_specs(textwrap.dedent(text))


def test_minimal_config_parses():
    specs = parse(MINIMAL)
    assert [spec.laser for spec in specs] == ["NL2"]
    assert specs[0].can("START_LASER")
    assert not specs[0].can("STOP_LASER")


def test_placeholder_command_falls_back_to_the_assembled_command_pv():
    spec = parse(MINIMAL)[0]
    assert spec.resolve_command("START_LASER").pv_name == "CMD_NL2_START_LASER"
    assert spec.resolve_command("START_LASER").value == 1


def test_real_command_pv_is_written_directly_with_its_value():
    spec = parse(MINIMAL.replace(
        "      START_LASER: START_LASER",
        "      START_LASER: START_LASER\n      MODBOX_OFF: {pv: L4:NL2:ModBox:Awake, value: Sleep}",
    ))[0]
    target = spec.resolve_command("MODBOX_OFF")
    assert (target.pv_name, target.value) == ("L4:NL2:ModBox:Awake", "Sleep")


def test_a_command_target_that_is_neither_placeholder_nor_pv_is_rejected():
    # `ALIGNMENT_MODE: SetAlignmentMode` used to reach the write path verbatim.
    with pytest.raises(ConfigError, match="neither the placeholder"):
        parse(MINIMAL.replace("START_LASER: START_LASER", "ALIGNMENT_MODE: SetAlignmentMode"))


def test_operator_valued_command_may_not_configure_a_value():
    with pytest.raises(ConfigError, match="takes its value from the operator"):
        parse(MINIMAL.replace(
            "      START_LASER: START_LASER",
            "      SET_DELAY: {pv: L4:NL2:SETDELAY, value: 700}",
        ))


def test_unknown_command_is_rejected():
    with pytest.raises(ConfigError, match="unknown command"):
        parse(MINIMAL.replace("START_LASER: START_LASER", "WARP_CORE: WARP_CORE"))


def test_duplicate_pv_is_rejected():
    with pytest.raises(ConfigError, match="duplicate PV name"):
        parse(MINIMAL.replace("phd2Mean: L4:NL2:PHD2", "phd2Mean: L4:NL2:PHD1"))


def test_two_commands_may_share_a_pv_when_they_write_different_values():
    spec = parse(MINIMAL.replace(
        "      START_LASER: START_LASER",
        "      MODBOX_ON: {pv: L4:NL2:Mode, value: Awake}\n"
        "      MODBOX_OFF: {pv: L4:NL2:Mode, value: Sleep}",
    ))[0]
    assert spec.resolve_command("MODBOX_ON").value == "Awake"


def test_unknown_key_is_rejected():
    with pytest.raises(ConfigError):
        parse(MINIMAL.replace("    mss: []", "    mss: []\n    mystery: 1"))


def test_unknown_signal_role_is_rejected():
    with pytest.raises(ConfigError, match="unknown signal role"):
        parse("units:\n  thermalMass: kg\n" + MINIMAL)


def test_per_laser_overrides_win_over_module_defaults():
    spec = parse("units:\n  regenTemp: K\nformat:\n  regenTemp: 3\n" + MINIMAL + "    units:\n      regenTemp: '°C'\n")[0]
    assert spec.unit("regenTemp") == "°C"
    assert spec.value_format("regenTemp").to_fixed == 3


def test_whitespace_only_pv_name_is_rejected():
    with pytest.raises(ConfigError):
        parse(MINIMAL.replace("shutter: L4:NL2:SHUT", "shutter: '   '"))


def test_duplicate_laser_id_is_rejected():
    doubled = MINIMAL + MINIMAL.split("lasers:", 1)[1]
    with pytest.raises(ConfigError, match="duplicate laser id"):
        parse(doubled)


def test_malformed_yaml_says_so():
    with pytest.raises(ConfigError, match="not valid YAML"):
        parse("lasers: [\n  - id: ]]")


def test_a_command_shorthand_pointing_at_a_readout_pv_is_a_duplicate():
    # The exact copy-paste typo the rule exists for: a button that would write 1
    # to the full-power readout.
    with pytest.raises(ConfigError, match="duplicate PV name"):
        parse(MINIMAL.replace(
            "      START_LASER: START_LASER",
            "      SYSTEM_STANDBY: L4:NL2:FULLP",
        ))


def test_a_command_value_must_be_something_caput_can_take():
    with pytest.raises(ConfigError, match="non-empty string or a number"):
        parse(MINIMAL.replace(
            "      START_LASER: START_LASER",
            "      MODBOX_OFF: {pv: L4:NL2:Mode, value: [1, 2]}",
        ))


def test_a_blank_unit_is_a_slip_not_an_empty_unit():
    with pytest.raises(ConfigError, match="non-empty label"):
        parse(MINIMAL + "    units:\n      regenTemp: '   '\n")


def test_an_out_of_range_format_is_rejected_at_load():
    with pytest.raises(ConfigError, match="between 0 and 100"):
        parse(MINIMAL + "    format:\n      regenTemp: {format: fixed, toFixed: -1}\n")
