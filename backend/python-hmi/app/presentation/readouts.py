"""Readout primitives — `components/hmi/controls/Values.tsx` as pure functions.

Each one takes the latest reading and answers the only three questions a
template needs: what text to print, which tone to paint with, what to say on
hover. Keeping that in Python rather than in Jinja is deliberate — it is the
logic that used to be unit-tested in `Values.test.tsx`, and a template is a bad
place to re-derive "is this reading trustworthy".

The severity decision itself is not made here; it comes from
`presentation.severity`, so a readout can never invent its own severity look.
What *is* decided here is the payload check: a message that arrived intact but
carries the wrong kind of value (a string where a number belongs, a NaN, an enum
index where a state name belongs) reads as invalid rather than as missing — a
missing-value placeholder there would hide the actual fault. It cost a debugging
session on the Regen state row, which sat on `<>` while the PV was happily
sending enum indices.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterable, Mapping

from app.epics.types import PvSample
from app.presentation.formatting import (
    ValueFormatOptions,
    format_value,
    resolve_format,
    resolve_units,
)
from app.presentation.severity import (
    Presentation,
    UNKNOWN_TEXT,
    present,
    present_aggregate,
    severity_tone,
    unreadable_value,
)
from app.presentation.value_text import display_value


@dataclass(frozen=True)
class Readout:
    """One rendered value: the text, the tone that paints it, the hover text."""

    text: str
    tone: str | None = None
    title: str | None = None
    units: str | None = None
    #: True when `text` replaced the value (`<>`, `PV INV`, `PV DSC`). A unit is
    #: never shown next to one of those — it would decorate a non-value.
    placeholder: bool = False
    #: Numbers are right-aligned and tabular so a column of them can be scanned;
    #: status strings are left-aligned. The readout knows which it produced, so
    #: the template does not have to guess from the text.
    numeric: bool = False


def _numeric_fault(sample: PvSample | None) -> Presentation | None:
    if sample is None or not sample.ok or sample.value is None:
        return None
    value = sample.value
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return unreadable_value(
            f"{sample.name}: expected a number, got {type(value).__name__}."
        )
    if not math.isfinite(value):
        # A NaN reading is a broken reading, not a missing one. Printing "nan"
        # into a cell, or quietly showing `<>` as though the PV had never
        # reported, both hide the fault.
        return unreadable_value(f"{sample.name}: non-finite reading (NaN or Infinity).")
    return None


def _string_fault(sample: PvSample | None) -> Presentation | None:
    if sample is None or not sample.ok or sample.value is None:
        return None
    if not isinstance(sample.value, str):
        return unreadable_value(
            f"{sample.name}: expected a string, got {type(sample.value).__name__} "
            f"({sample.value}). An enum record read at its native type sends its "
            f"index, not its name."
        )
    return None


def _resolved(
    sample: PvSample | None,
    *,
    pv_name: str,
    emphasis: str | None,
    is_connected: bool,
    fault: Presentation | None,
) -> Presentation:
    """A severity the control system reported outranks our own read of the
    payload: if the IOC says INVALID, that is the more authoritative story.
    """
    presentation = present(
        sample, emphasis=emphasis, pv_name=pv_name, is_connected=is_connected
    )
    if presentation.tone is None and fault is not None:
        return fault
    return presentation


def number_readout(
    sample: PvSample | None,
    *,
    pv_name: str,
    value_format: ValueFormatOptions | None = None,
    format_fallback: ValueFormatOptions | None = None,
    units: str | None = None,
    units_fallback: str | None = None,
    emphasis: str | None = None,
    is_connected: bool = True,
    integer: bool = False,
) -> Readout:
    """`FloatValue` / `IntegerValue`.

    `integer=True` with no configured format rounds, which is what the React
    `IntegerValue` did: an attenuator position is a whole number and 51.000
    reads as noise.
    """
    presentation = _resolved(
        sample,
        pv_name=pv_name,
        emphasis=emphasis,
        is_connected=is_connected,
        fault=_numeric_fault(sample),
    )
    if presentation.text is not None:
        return Readout(
            text=presentation.text,
            tone=presentation.tone,
            title=presentation.title,
            placeholder=True,
        )
    value = sample.value if sample is not None else None
    if (
        sample is None
        or not sample.ok
        or not isinstance(value, (int, float))
        or isinstance(value, bool)
        or not math.isfinite(value)
    ):
        return Readout(
            text=UNKNOWN_TEXT,
            tone=presentation.tone or "unknown",
            title=presentation.title,
            placeholder=True,
        )
    if integer and value_format is None and format_fallback is None:
        text = str(_round_half_up(value))
    else:
        text = format_value(value, resolve_format(value_format, format_fallback))
    return Readout(
        text=text,
        tone=presentation.tone,
        title=presentation.title,
        units=resolve_units(
            units, sample.units if sample is not None else None, units_fallback
        ),
        numeric=True,
    )


def string_readout(
    sample: PvSample | None,
    *,
    pv_name: str,
    emphasis: str | None = None,
    is_connected: bool = True,
) -> Readout:
    """`StringValue`."""
    presentation = _resolved(
        sample,
        pv_name=pv_name,
        emphasis=emphasis,
        is_connected=is_connected,
        fault=_string_fault(sample),
    )
    if presentation.text is not None:
        return Readout(
            text=presentation.text,
            tone=presentation.tone,
            title=presentation.title,
            placeholder=True,
        )
    if sample is None or not sample.ok or not isinstance(sample.value, str):
        return Readout(
            text=UNKNOWN_TEXT,
            tone=presentation.tone or "unknown",
            title=presentation.title,
            placeholder=True,
        )
    return Readout(text=sample.value, tone=presentation.tone, title=presentation.title)


def bool_readout(
    sample: PvSample | None,
    *,
    pv_name: str,
    on_label: str,
    off_label: str,
    on_emphasis: str | None = None,
    is_connected: bool = True,
    strict: bool = False,
) -> Readout:
    """`BoolPill`. Emphasis applies to the ON state only — a shutter being open
    is not good or bad, but a connection being up is.

    `strict` is `OverviewBoolCell`'s three-way branch: 1 -> on, 0 -> off,
    anything else -> `<>`. The CONN and FULLP cells use it, because an mbbi that
    reports 2 must not read as a confident "NO". The shutter pill does not,
    matching `BoolPill`.
    """
    is_on = sample is not None and sample.value == 1
    presentation = present(
        sample,
        emphasis=on_emphasis if is_on else None,
        pv_name=pv_name,
        is_connected=is_connected,
    )
    if presentation.text is not None:
        return Readout(
            text=presentation.text,
            tone=presentation.tone,
            title=presentation.title,
            placeholder=True,
        )
    if sample is None or not sample.ok or sample.value is None:
        return Readout(
            text=UNKNOWN_TEXT,
            tone=presentation.tone or "unknown",
            title=presentation.title,
            placeholder=True,
        )
    if strict and not is_on and sample.value != 0:
        return Readout(
            text=UNKNOWN_TEXT,
            tone=presentation.tone or "unknown",
            title=presentation.title,
            placeholder=True,
        )
    return Readout(
        text=on_label if is_on else off_label,
        tone=presentation.tone,
        title=presentation.title,
    )


def mapped_readout(
    sample: PvSample | None,
    *,
    pv_name: str,
    values: Mapping[str, str] | None = None,
    defaults: Mapping[str, str] | None = None,
    is_connected: bool = True,
) -> Readout:
    """One row of an expanded detail list (MSS bit, Modbox subsystem, module
    error code). The shared table replaces the text only when the reading is
    unusable; otherwise the value is translated for display.
    """
    presentation = present(sample, pv_name=pv_name, is_connected=is_connected)
    if presentation.text is not None:
        return Readout(
            text=presentation.text,
            tone=presentation.tone,
            title=presentation.title,
            placeholder=True,
        )
    text = display_value(sample.value if sample is not None else None, values, defaults)
    return Readout(
        text=text if text is not None else UNKNOWN_TEXT,
        tone=presentation.tone,
        title=presentation.title,
        placeholder=text is None,
    )


def single_readout(
    sample: PvSample | None,
    *,
    pv_name: str,
    fallback_text: str,
    emphasis: str | None = None,
    is_connected: bool = True,
) -> Readout:
    """A pill whose text the widget decides (RUNNING / IDLE) but whose tone and
    tooltip come from one PV.

    Distinct from `aggregate_readout` on purpose: the aggregate tooltip counts
    offenders ("1 of 1 readings unusable"), and it says nothing at all at
    severity 0 — whereas a single-PV readout always names its record, which is
    the only place that name appears on the panel.
    """
    presentation = present(
        sample, emphasis=emphasis, pv_name=pv_name, is_connected=is_connected
    )
    return Readout(
        text=presentation.text if presentation.text is not None else fallback_text,
        tone=presentation.tone,
        title=presentation.title,
        placeholder=presentation.text is not None,
    )


def aggregate_readout(
    samples: Iterable[PvSample | None],
    *,
    fallback_text: str,
    emphasis: str | None = None,
    is_connected: bool = True,
) -> Readout:
    """A summary pill (MSS overall, ERR count, Modbox n/total).

    `fallback_text` is what the widget would say on its own — a YES/NO word or a
    count — and is used unless severity replaces it.
    """
    presentation = present_aggregate(
        samples, emphasis=emphasis, is_connected=is_connected
    )
    return Readout(
        text=presentation.text if presentation.text is not None else fallback_text,
        tone=presentation.tone,
        title=presentation.title,
        placeholder=presentation.text is not None,
    )


def is_usable(sample: PvSample | None) -> bool:
    """Whether a reading may be counted in a tally.

    A PV that is INVALID or disconnected often still carries its last value;
    counting that would let a dead flashlamp channel report itself as RUN. An
    alarmed (MINOR/MAJOR) channel IS counted — its reading is real, the control
    system is just unhappy about it.
    """
    return severity_tone(sample) not in ("invalid", "unknown")


def _round_half_up(value: float) -> int:
    """`Math.round` semantics: 50.5 -> 51. Python's `round` is banker's
    rounding (50.5 -> 50), which would make an attenuator readout differ from
    the MVP by one for every half value.
    """
    return math.floor(value + 0.5)
