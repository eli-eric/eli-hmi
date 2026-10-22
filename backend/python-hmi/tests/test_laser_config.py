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


class TestTheBlocksThatWereSplitUp:
    """`units:`, `format:` and `labels:` were three parallel blocks keyed by
    role, which put one readout in four places and two vocabularies. They are
    written inside each `pvs:` entry now, and a config still carrying one is
    refused — silently ignoring it would leave a screen rendering something
    nobody asked for.
    """

    @pytest.mark.parametrize("block", ["units", "format", "labels"])
    def test_a_block_that_moved_is_refused(self, block):
        with pytest.raises(ValidationError):
            parse(MINIMAL + f"    {block}:\n      regenTemp: degC\n")

    def test_the_pv_the_sequencer_used_is_refused(self):
        """Its row reads RUNNING while any of `sequences:` does, so a laser
        still naming a flag of its own is configuring nothing."""
        text = MINIMAL.replace(
            "      regenTemp: L4:NL2:REGEN:T",
            "      regenTemp: L4:NL2:REGEN:T\n      sequencerRunning: L4:NL2:BUSY",
        )
        with pytest.raises(ValidationError):
            parse(text)


def with_signal(role: str, **options) -> str:
    """MINIMAL with one `pvs:` entry written in its long form."""
    body = "\n".join(f"        {key}: {value}" for key, value in options.items())
    return MINIMAL.replace(
        f"      {role}: L4:NL2:REGEN:T" if role == "regenTemp" else f"      {role}:",
        f"      {role}:\n        pv: L4:NL2:REGEN:T\n{body}",
    )


class TestTheWriteSideOfADevice:
    """A device's setpoint record is not its readback. The shutter opened by
    writing to the record that reports its position only works where the two
    happen to be one PV — the simulator, and not the hall."""

    def test_the_shutter_has_a_command_for_each_direction(self):
        laser = parse(
            MINIMAL
            + "      OPEN_SHUTTER: {pv: L4:NL2:SHUT:SET, value: 1}\n"
            + "      CLOSE_SHUTTER: {pv: L4:NL2:SHUT:SET, value: 0}\n"
        )
        assert laser.can("OPEN_SHUTTER") and laser.can("CLOSE_SHUTTER")
        opened = laser.resolve_command("OPEN_SHUTTER")
        assert (opened.pv_name, opened.value) == ("L4:NL2:SHUT:SET", 1)
        assert laser.resolve_command("CLOSE_SHUTTER").value == 0

    def test_the_attenuator_has_one(self):
        laser = parse(MINIMAL + "      SET_ATTENUATOR: L4:NL2:ATT:SET\n")
        assert laser.resolve_command("SET_ATTENUATOR").pv_name == "L4:NL2:ATT:SET"

    def test_a_value_for_the_attenuator_is_refused(self):
        """The operator types it, so a configured one would never be written."""
        with pytest.raises(ValidationError, match="operator"):
            parse(MINIMAL + "      SET_ATTENUATOR: {pv: L4:NL2:ATT:SET, value: 1024}\n")


class TestWhatOneSignalSays:
    """Everything about a reading is written where its PV is."""

    def test_a_signal_names_its_own_row(self):
        laser = parse(with_signal("regenTemp", label="Regen Temp TK3:21"))
        assert laser.label("regenTemp") == "Regen Temp TK3:21"

    def test_a_signal_that_says_nothing_keeps_the_defaults(self):
        laser = parse(MINIMAL)
        assert laser.label("regenTemp") == "Regen Temp TK6:44"
        assert laser.unit("regenTemp") is None, "nothing to override"
        assert laser.default_unit("regenTemp") == "°C", "the component knows"

    def test_units_and_format_are_read_back_from_the_signal(self):
        laser = parse(with_signal("regenTemp", units="degC", format=1))
        assert laser.unit("regenTemp") == "degC"
        assert laser.value_format("regenTemp").to_fixed == 1

    def test_a_blank_unit_is_a_slip_not_an_empty_unit(self):
        with pytest.raises(ValidationError):
            parse(with_signal("regenTemp", units="'   '"))

    def test_an_out_of_range_format_is_rejected_at_load(self):
        with pytest.raises(ValidationError, match="between 0 and 100"):
            parse(with_signal("regenTemp", format="{format: fixed, toFixed: -1}"))

    def test_an_unknown_key_in_a_signal_is_rejected(self):
        with pytest.raises(ValidationError):
            parse(with_signal("regenTemp", colour="red"))

    def test_a_signal_missing_its_pv_says_so(self):
        text = MINIMAL.replace(
            "      regenTemp: L4:NL2:REGEN:T", "      regenTemp:\n        label: Regen"
        )
        with pytest.raises(ValidationError, match="missing 'pv'"):
            parse(text)

    def test_naming_a_row_the_component_owns_is_refused(self):
        """The trigger-delay channels share one row whose name is fixed, so a
        label here would be written and never shown."""
        text = MINIMAL.replace(
            "triggerDelay: [L4:NL2:DELAY1]", "triggerDelay: [L4:NL2:DELAY1]"
        ).replace(
            "      connection: L4:NL2:CONN",
            "      connection:\n        pv: L4:NL2:CONN\n        label: Link",
        )
        with pytest.raises(ValidationError, match="the component's"):
            parse(text)


class TestTheYamlSpelling:
    """Every key is camelCase in YAML, because the React app's schema is where
    this format came from and a controls engineer copies blocks between them.
    A field that only answers to its Python name is a key that silently is not
    the documented one."""

    def test_the_waveform_catalog_url_is_camel_case(self):
        laser = parse(
            MINIMAL + "    waveformsUrl: https://modbox-nl2.lcs.local/api/waveforms\n"
        )
        assert laser.waveforms_url == "https://modbox-nl2.lcs.local/api/waveforms"

    def test_every_multi_word_field_answers_to_its_camel_case_name(self):
        from components.laser_panel.config import (
            ChillerSpec,
            LaserPvs,
            SequenceSpec,
            SignalOptions,
        )

        missing = []
        for model in (Config, LaserPvs, SequenceSpec, ChillerSpec, SignalOptions):
            for name, field in model.model_fields.items():
                head, *rest = name.split("_")
                camel = head + "".join(word.capitalize() for word in rest)
                if camel != name and not field.alias:
                    missing.append(f"{model.__name__}.{name} (wanted {camel})")
        assert not missing, f"fields with no camelCase alias: {missing}"


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
