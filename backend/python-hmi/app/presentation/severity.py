"""Severity -> tone/text/tooltip. Port of the TypeScript trio
`lib/websocket/severity.ts`, `severity-presentation.ts` and `pv-tooltip.ts`.

This is THE single place that decides how a reading looks, exactly as it was in
the React app: a template never inspects `severity` itself, it asks for a
`Presentation` and renders `tone` / `text` / `title`. Re-styling the whole HMI
is still an edit to one table (`_PRESENTATION` below) plus the tone layer in
`static/css/hmi.css`.

Precedence, highest first: transport loss > EPICS severity > widget emphasis.
An alarmed PV cannot be painted over by a widget's "this is good" emphasis, and
an alarm cannot look live once the link that delivered it is gone.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Iterable, Literal, Sequence

from app.epics.types import PvSample

# EPICS alarm severities (epicsAlarm.h).
SEVERITY_NONE = 0
SEVERITY_MINOR = 1
SEVERITY_MAJOR = 2
SEVERITY_INVALID = 3

SEVERITY_NAMES = ("NO_ALARM", "MINOR", "MAJOR", "INVALID")

#: EPICS alarm status names, indexed by code (`epicsAlarm.h`
#: `epicsAlarmConditionStrings`).
#:
#: These are the control system's own words. To show operators something
#: friendlier — "sensor above high-high limit" instead of `HIHI` — replace the
#: entries here, or have the gateway send a phrase instead of a code:
#: `describe_status` passes a string through untouched.
STATUS_NAMES = (
    "NO_ALARM",
    "READ",
    "WRITE",
    "HIHI",
    "HIGH",
    "LOLO",
    "LOW",
    "STATE",
    "COS",
    "COMM",
    "TIMEOUT",
    "HWLIMIT",
    "CALC",
    "SCAN",
    "LINK",
    "SOFT",
    "BAD_SUB",
    "UDF",
    "DISABLE",
    "SIMM",
    "READ_ACCESS",
    "WRITE_ACCESS",
)

# Text shown when no message has arrived for a PV yet.
UNKNOWN_TEXT = "<>"
# EPICS INVALID severity (3) on a still-connected PV.
INVALID_TEXT = "PV INV"
# The gateway reports the PV itself as bad (`ok: false`).
DISCONNECTED_TEXT = "PV DSC"

#: Reason line shown while the backend link is down (`TRANSPORT_DOWN_REASON`).
TRANSPORT_DOWN_TITLE = (
    "Backend disconnected — this is the last value received, not a live reading."
)

SeverityTone = Literal["unknown", "invalid", "error", "warning", "none"]

#: Tones the CSS tone layer knows how to paint. `None` means "leave unstyled".
Tone = str

_RANK: dict[str, int] = {"none": 0, "unknown": 0, "warning": 1, "error": 2, "invalid": 3}


def severity_tone(sample: PvSample | None) -> SeverityTone:
    """Abstract tone for one reading.

    - ``unknown``: nothing has arrived yet (cold start) — not a real severity.
    - ``invalid``: the gateway flagged the PV bad, or EPICS severity INVALID.
    - ``error`` / ``warning``: MAJOR / MINOR.
    - ``none``: severity 0 — no style change.
    """
    if sample is None:
        return "unknown"
    if not sample.ok or sample.severity == SEVERITY_INVALID:
        return "invalid"
    if sample.severity == SEVERITY_MAJOR:
        return "error"
    if sample.severity == SEVERITY_MINOR:
        return "warning"
    return "none"


def worst_severity_tone(tones: Sequence[SeverityTone]) -> SeverityTone:
    """Worst child tone, for an aggregate indicator.

    ``unknown`` only wins when EVERY child is unknown: as soon as one child has
    real data the aggregate reflects that data rather than the cold-start
    placeholder.
    """
    if not tones or all(t == "unknown" for t in tones):
        return "unknown"
    worst: SeverityTone = "none"
    for tone in tones:
        if tone == "unknown":
            continue
        if _RANK[tone] > _RANK[worst]:
            worst = tone
    return worst


@dataclass(frozen=True)
class Presentation:
    """What a widget renders.

    ``text`` REPLACES the widget's own value text; ``None`` means "keep it"
    (used for MINOR/MAJOR, where the reading is still real).
    """

    tone: Tone | None = None
    text: str | None = None
    title: str | None = None


_PRESENTATION: dict[SeverityTone, Presentation] = {
    "none": Presentation(),
    "unknown": Presentation(tone="unknown", text=UNKNOWN_TEXT),
    "warning": Presentation(tone="warning"),
    "error": Presentation(tone="error"),
    "invalid": Presentation(tone="invalid", text=INVALID_TEXT),
}


def describe_severity(severity: int) -> str:
    """Severity as text; unknown codes fall back to their number."""
    if 0 <= severity < len(SEVERITY_NAMES):
        return SEVERITY_NAMES[severity]
    return f"severity {severity}"


def describe_status(status: int | str | None) -> str | None:
    """Status as text: a phrase from the gateway verbatim, a known code by name,
    an unknown code as `status 42`, and nothing at all when the gateway sent
    none (a subscription at detail 'value').
    """
    if status is None:
        return None
    if isinstance(status, str):
        return status.strip() or None
    if 0 <= status < len(STATUS_NAMES):
        return STATUS_NAMES[status]
    return f"status {status}"


def _format_value(value: Any) -> str:
    return "unknown" if value is None else str(value)


def _format_reading(value: Any, timestamp: float) -> str:
    """`"24.810 (at 12:03:44)"`, or just the value when the timestamp is unusable."""
    at = None
    if timestamp:
        try:
            at = datetime.fromtimestamp(timestamp, tz=timezone.utc).strftime("%H:%M:%S")
        except (OverflowError, OSError, ValueError):
            at = None
    return f"{_format_value(value)}{f' (at {at})' if at else ''}"


def _last_known_reading(sample: PvSample) -> str:
    """The last reading taken while the PV was still trustworthy. Falling back
    to the sample's own value covers a PV that went bad on its very first
    message (nothing was ever remembered) and one whose payload survived the
    alarm.
    """
    if sample.last_valid is not None:
        return _format_reading(sample.last_valid.value, sample.last_valid.timestamp)
    return _format_reading(sample.value, sample.timestamp)


def describe_pv(
    sample: PvSample | None,
    *,
    pv_name: str | None = None,
    is_connected: bool = True,
) -> str | None:
    """Hover text for one PV. Port of `pv-tooltip.ts`.

    Every readout gets one, always naming the PV — on a dense panel of anonymous
    numbers, "which record is this?" is the question an operator most often has,
    and it is unanswerable from the screen. Beyond the name, the tooltip only
    says something when there is something to say:

    - severity 0: the name alone.
    - MINOR / MAJOR: severity and status — *how bad* and *why*.
    - INVALID: severity and status, plus the last value seen while the reading
      was still trustworthy (the displayed value has been replaced by PV INV).
    - PV disconnected: no severity or status — a dead channel's alarm fields
      describe the past, not the present — but the last known value, so the
      operator can still see where the machine was.

    Returns ``None`` only when there is nothing at all to identify.
    """
    name = sample.name if sample is not None else pv_name
    if not name:
        return None
    lines = [name]

    if not is_connected:
        lines.append(TRANSPORT_DOWN_TITLE)
        if sample is not None:
            lines.append(f"Last known value: {_last_known_reading(sample)}")
        return "\n".join(lines)

    if sample is None:
        return "\n".join(lines)

    # A disconnected channel reports no current condition: its severity and
    # status describe whatever it was doing before it went away, so repeating
    # them here would present stale facts as live ones.
    if not sample.ok:
        lines.append("PV disconnected")
        if sample.error:
            lines.append(sample.error)
        lines.append(f"Last known value: {_last_known_reading(sample)}")
        return "\n".join(lines)

    if sample.severity == SEVERITY_NONE:
        return "\n".join(lines)

    lines.append(f"Severity: {describe_severity(sample.severity)}")
    status = describe_status(sample.status)
    if status:
        lines.append(f"Status: {status}")

    # INVALID replaces the reading on screen with PV INV, so the tooltip is the
    # only place left that can say what it was.
    if sample.severity == SEVERITY_INVALID:
        lines.append(f"Last good value: {_last_known_reading(sample)}")

    return "\n".join(lines)


def present(
    sample: PvSample | None,
    *,
    emphasis: str | None = None,
    pv_name: str | None = None,
    is_connected: bool = True,
) -> Presentation:
    """Presentation for one PV's latest reading."""
    if not is_connected:
        return Presentation(
            tone="unknown",
            text=None if sample is not None else UNKNOWN_TEXT,
            title=describe_pv(sample, pv_name=pv_name, is_connected=False),
        )

    title = describe_pv(sample, pv_name=pv_name)
    tone = severity_tone(sample)
    if tone == "none":
        return Presentation(tone=emphasis, title=title) if emphasis else Presentation(title=title)

    base = _PRESENTATION[tone]
    if base.tone != "invalid" or sample is None:
        return Presentation(tone=base.tone, text=base.text, title=title)
    # Both causes of an untrustworthy reading share the tone but read
    # differently: a transport failure is the more specific, more actionable one.
    text = DISCONNECTED_TEXT if not sample.ok else INVALID_TEXT
    return Presentation(tone=base.tone, text=text, title=title)


def unreadable_value(reason: str) -> Presentation:
    """A reading that arrived intact but is not the kind of value expected —
    a string where a number belongs, a NaN. Same class of problem as INVALID,
    so it wears the same tone rather than inventing a private "broken" look.
    """
    return Presentation(tone="invalid", text=INVALID_TEXT, title=reason)


def present_aggregate(
    samples: Iterable[PvSample | None],
    *,
    emphasis: str | None = None,
    is_connected: bool = True,
) -> Presentation:
    """Presentation for a summary indicator covering several PVs."""
    samples = list(samples)
    if not is_connected:
        first = next((s for s in samples if s is not None), None)
        return Presentation(
            tone="unknown",
            text=None if first is not None else UNKNOWN_TEXT,
            title=TRANSPORT_DOWN_TITLE,
        )

    worst = worst_severity_tone([severity_tone(s) for s in samples])
    if worst == "none":
        return Presentation(tone=emphasis) if emphasis else Presentation()

    base = _PRESENTATION[worst]
    if base.tone != "invalid":
        return base

    offenders = [s for s in samples if s is not None and severity_tone(s) == "invalid"]
    all_disconnected = bool(offenders) and all(not s.ok for s in offenders)
    title_lines = [f"{len(offenders)} of {len(samples)} readings unusable:"]
    title_lines += [(describe_pv(s) or s.name).replace("\n", " · ") for s in offenders]
    return Presentation(
        tone=base.tone,
        text=DISCONNECTED_TEXT if all_disconnected else INVALID_TEXT,
        title="\n".join(title_lines),
    )
