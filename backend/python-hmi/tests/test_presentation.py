"""The ported presentation logic, tested against the same cases the React unit
tests covered. These are the rules an operator's safety depends on, so they are
the ones worth pinning down.
"""

from __future__ import annotations

import pytest

from app.epics.types import PvSample
from app.presentation.formatting import (
    RAW_FORMAT,
    ValueFormatOptions,
    format_value,
    parse_format,
    resolve_units,
)
from app.presentation.readouts import bool_readout, number_readout, string_readout
from app.presentation.severity import (
    DISCONNECTED_TEXT,
    INVALID_TEXT,
    UNKNOWN_TEXT,
    present,
    present_aggregate,
    severity_tone,
    worst_severity_tone,
)
from app.presentation.value_text import ON_OFF_TEXT, YES_NO_TEXT, display_value


def sample(**kwargs) -> PvSample:
    return PvSample(name=kwargs.pop("name", "PV:TEST"), **kwargs)


class TestSeverityTone:
    def test_no_message_is_unknown(self):
        assert severity_tone(None) == "unknown"

    @pytest.mark.parametrize(
        "severity,expected",
        [(0, "none"), (1, "warning"), (2, "error"), (3, "invalid")],
    )
    def test_epics_severities(self, severity, expected):
        assert severity_tone(sample(value=1, severity=severity)) == expected

    def test_not_ok_is_invalid_whatever_the_severity(self):
        assert severity_tone(sample(ok=False, severity=0)) == "invalid"


class TestWorstTone:
    def test_unknown_only_wins_when_every_child_is_unknown(self):
        assert worst_severity_tone(["unknown", "unknown"]) == "unknown"
        # One child with real data is enough to leave the cold-start placeholder.
        assert worst_severity_tone(["unknown", "none"]) == "none"

    def test_worst_wins(self):
        assert worst_severity_tone(["none", "warning", "error"]) == "error"
        assert worst_severity_tone(["error", "invalid"]) == "invalid"

    def test_empty_is_unknown(self):
        assert worst_severity_tone([]) == "unknown"


class TestPresentation:
    def test_minor_and_major_keep_the_real_value(self):
        # The reading is still real; the panel tints it rather than hiding it.
        assert present(sample(value=1, severity=1)).text is None
        assert present(sample(value=1, severity=2)).text is None

    def test_invalid_and_disconnected_read_differently(self):
        assert present(sample(value=1, severity=3)).text == INVALID_TEXT
        assert present(sample(ok=False, error="timeout")).text == DISCONNECTED_TEXT

    def test_emphasis_only_applies_at_severity_zero(self):
        good = present(sample(value=1), emphasis="positive-important")
        assert good.tone == "positive-important"
        alarmed = present(sample(value=1, severity=2), emphasis="positive-important")
        assert alarmed.tone == "error"

    def test_transport_loss_outranks_severity_and_keeps_the_last_value(self):
        result = present(sample(value=1, severity=2), is_connected=False)
        assert result.tone == "unknown"
        assert result.text is None  # keep showing what the machine was doing

    def test_transport_loss_with_no_value_falls_back_to_placeholder(self):
        assert present(None, is_connected=False).text == UNKNOWN_TEXT

    def test_title_always_names_the_pv(self):
        assert "PV:TEST" in (present(None, pv_name="PV:TEST").title or "")


class TestAggregate:
    def test_all_disconnected_says_so(self):
        result = present_aggregate([sample(ok=False), sample(ok=False)])
        assert result.text == DISCONNECTED_TEXT

    def test_mixed_offenders_fall_back_to_the_generic_label(self):
        result = present_aggregate([sample(ok=False), sample(value=1, severity=3)])
        assert result.text == INVALID_TEXT

    def test_title_names_every_offender(self):
        result = present_aggregate(
            [sample(name="A", ok=False), sample(name="B", value=1), sample(name="C", ok=False)]
        )
        assert "2 of 3" in (result.title or "")


class TestFormatting:
    def test_fixed_is_decimal_places(self):
        assert format_value(1.23456, ValueFormatOptions(format="fixed", to_fixed=2)) == "1.23"

    def test_precision_is_significant_digits(self):
        assert format_value(1.2345, ValueFormatOptions(format="precision", to_precision=3)) == "1.23"

    def test_exponent_is_spelled_the_way_javascript_spells_it(self):
        # `toExponential(2)` gives 1.23e+5, not Python's zero-padded 1.23e+05.
        assert format_value(123456.0, ValueFormatOptions(format="exponential", to_exponential=2)) == "1.23e+5"
        assert format_value(1234.5, ValueFormatOptions(format="precision", to_precision=2)) == "1.2e+3"
        assert format_value(0.0000001, ValueFormatOptions(format="exponential", to_exponential=1)) == "1.0e-7"

    def test_out_of_range_options_are_rejected_at_load_not_at_render(self):
        # A `toFixed: -1` that passes validation raises inside `format_value`,
        # which takes down the page and every open SSE stream.
        with pytest.raises(ValueError, match="between 0 and 100"):
            parse_format({"format": "fixed", "toFixed": -1})
        with pytest.raises(ValueError, match="unknown key"):
            parse_format({"format": "fixed", "toFixedd": 1})

    def test_an_integral_float_is_the_shorthand_too(self):
        # `Number.isInteger(2.0)` is true, so the zod schema accepts it.
        assert parse_format(2.0) == ValueFormatOptions(format="fixed", to_fixed=2)

    def test_raw_keeps_whole_numbers_whole(self):
        # A trigger delay is whole nanoseconds; 790.000 would read as noise.
        assert format_value(790.0, RAW_FORMAT) == "790"

    def test_bare_number_shorthand(self):
        assert parse_format(2) == ValueFormatOptions(format="fixed", to_fixed=2)

    def test_full_object(self):
        assert parse_format({"format": "exponential", "toExponential": 1}).format == "exponential"

    def test_rejects_nonsense(self):
        with pytest.raises(ValueError):
            parse_format({"format": "sideways"})

    def test_units_resolution_order(self):
        assert resolve_units("cfg", "meta", "fallback") == "cfg"
        assert resolve_units(None, "meta", "fallback") == "meta"
        assert resolve_units(None, "   ", "fallback") == "fallback"


class TestTooltip:
    def test_severity_zero_is_the_name_alone(self):
        from app.presentation.severity import describe_pv

        assert describe_pv(sample(value=1)) == "PV:TEST"

    def test_an_alarm_says_how_bad_and_why(self):
        from app.presentation.severity import describe_pv

        text = describe_pv(sample(value=1, severity=2, status=3))
        assert "Severity: MAJOR" in text and "Status: HIHI" in text

    def test_invalid_says_what_the_reading_was(self):
        from app.epics.types import LastValid
        from app.presentation.severity import describe_pv

        text = describe_pv(
            PvSample(name="PV:TEST", value=None, severity=3, last_valid=LastValid(24.81, 0))
        )
        assert "Last good value: 24.81" in text

    def test_a_disconnected_channel_reports_no_stale_alarm_fields(self):
        from app.presentation.severity import describe_pv

        text = describe_pv(sample(ok=False, severity=2, status=3, error="timeout"))
        assert "PV disconnected" in text
        assert "Severity" not in text  # those fields describe the past
        assert "timeout" in text

    def test_nothing_to_identify_at_all(self):
        from app.presentation.severity import describe_pv

        assert describe_pv(None) is None


class TestValueText:
    def test_config_wins_over_the_default(self):
        assert display_value(1, {"1": "ARMED"}, ON_OFF_TEXT) == "ARMED"

    def test_default_applies_when_config_is_silent(self):
        assert display_value(0, None, YES_NO_TEXT) == "NO"

    def test_unmapped_value_stays_visible(self):
        # A "boolean" that one day reports 7 must not vanish or be mistranslated.
        assert display_value(7, None, ON_OFF_TEXT) == "7"

    def test_nothing_to_show(self):
        assert display_value(None) is None


class TestReadouts:
    def test_a_string_where_a_number_belongs_is_invalid_not_missing(self):
        readout = number_readout(sample(value="OFF"), pv_name="PV:TEST")
        assert readout.text == INVALID_TEXT
        assert "expected a number" in (readout.title or "")

    def test_an_enum_index_where_a_state_name_belongs_is_invalid(self):
        # The Regen-state bug: the row sat on `<>` while the PV sent indices.
        readout = string_readout(sample(value=2), pv_name="PV:STATE")
        assert readout.text == INVALID_TEXT
        assert "index, not its name" in (readout.title or "")

    def test_reported_severity_outranks_our_own_payload_check(self):
        readout = number_readout(sample(value="OFF", severity=2), pv_name="PV:TEST")
        assert readout.tone == "error"

    def test_integer_readout_rounds_without_a_configured_format(self):
        assert number_readout(sample(value=51.4), pv_name="PV:A", integer=True).text == "51"

    def test_units_are_never_shown_next_to_a_placeholder(self):
        readout = number_readout(sample(ok=False), pv_name="PV:A", units="°C")
        assert readout.units is None
        assert readout.placeholder

    def test_bool_pill_emphasis_applies_to_on_only(self):
        on = bool_readout(
            sample(value=1), pv_name="PV:A", on_label="YES", off_label="NO",
            on_emphasis="positive-important",
        )
        off = bool_readout(
            sample(value=0), pv_name="PV:A", on_label="YES", off_label="NO",
            on_emphasis="positive-important",
        )
        assert (on.text, on.tone) == ("YES", "positive-important")
        assert (off.text, off.tone) == ("NO", None)
