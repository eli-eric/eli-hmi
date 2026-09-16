"""How one laser's readings become template contexts.

Pure functions: latest readings in, a dict for a macro out. This is the logic
that used to live in each React section component (`OverviewBar.tsx`,
`FlashlampsSection.tsx`, …), and it is separated from the widget wiring in
`component.py` for the same reason it was worth unit-testing there — it is where
the judgements live. How many flashlamps count as accounted for, whether a
failed permission is the panel's business to colour, what a mismatched trigger
delay should say.
"""

from __future__ import annotations

from typing import Any, Mapping

from core.components import Component, Datatype, PvReader
from core.render import (
    ON_OFF_TEXT,
    RAW_FORMAT,
    TRANSPORT_DOWN_TITLE,
    UNKNOWN_TEXT,
    YES_NO_TEXT,
    Readout,
    aggregate_readout,
    bool_readout,
    format_value,
    is_usable,
    mapped_readout,
    number_readout,
    present_aggregate,
    resolve_format,
    resolve_units,
    severity_tone,
    single_readout,
    string_readout,
)

from .commands import sequence_state_pv
from .config import Config

MSS_NOTE = (
    "This is a selection of some MSS indicators, it is NOT an exhaustive list of "
    "all parameters that lead to the overall MSS indicator."
)
ERR_NOTE = "Error code 0 means no error."

#: Flashlamp state columns. Capped at four by the row's width: a 22rem panel
#: minus the 8.5rem label and 2.25rem action column leaves ~2.4rem per cell,
#: about what a bold 4-character header needs.
FLASHLAMP_STATES: tuple[str, ...] = ("SB", "RUN", "STOP", "FAIL")

#: The PV delivers the full enum name. Only these four have a count column;
#: IGNITION, BUSY and OFF are counted in none, but every channel's raw state is
#: still shown in the expanded list.
FLASHLAMP_ALIASES: Mapping[str, str] = {
    "STANDBY": "SB",
    "RUN": "RUN",
    "STOP": "STOP",
    "FAILURE": "FAIL",
}

#: Default sequence set, mapped to the backend sequence commands. Matches
#: `L4_OPCPA_SEQUENCES` in `SequencerSection.tsx`.
SEQUENCES: tuple[tuple[str, str], ...] = (
    ("Start Laser", "START_LASER"),
    ("Stop Laser", "STOP_LASER"),
    ("Set to Alignment Mode", "ALIGNMENT_MODE"),
    ("Set to System Standby", "SYSTEM_STANDBY"),
    ("Set All Flashlamps to Run", "FLASHLAMPS_RUN"),
    ("Set All Flashlamps to Standby", "FLASHLAMPS_STANDBY"),
)





def overview(read: PvReader, spec: Config, comp: Component) -> dict[str, Any]:
    """CONN / FULLP / MSS / ERR — `OverviewBar.tsx`.

    Green when good, plain when bad. A red "NO" here would be the panel's own
    opinion about a value the control system did not flag; if a failed MSS bit
    or a non-zero error code is genuinely an alarm, the IOC says so through
    severity and that tone paints it. Absence of green is the signal.
    """
    connected = read.is_connected
    conn = bool_readout(
        read(spec.pvs.connection),
        pv_name=spec.pvs.connection,
        on_label="YES",
        off_label="NO",
        on_emphasis="positive-important",
        is_connected=connected,
        strict=True,
    )
    fullp = bool_readout(
        read(spec.pvs.full_power),
        pv_name=spec.pvs.full_power,
        on_label="YES",
        off_label="NO",
        on_emphasis="positive-important",
        is_connected=connected,
        strict=True,
    )

    mss_samples = read.many(item.pv for item in spec.mss)
    mss_total = len(spec.mss)
    # "ok" means healthy AND unalarmed — otherwise the pill could read YES while
    # painted red for an alarmed child.
    mss_ok = sum(
        1
        for sample in mss_samples
        if severity_tone(sample) == "none" and sample is not None and sample.value == 1
    )
    mss = aggregate_readout(
        mss_samples,
        fallback_text="YES" if mss_ok == mss_total else "NO",
        emphasis="positive-important" if mss_ok == mss_total else None,
        is_connected=connected,
    )

    err_samples = read.many(item.pv for item in spec.module_errors)
    err_total = len(spec.module_errors)
    err_unknown = sum(1 for sample in err_samples if severity_tone(sample) == "unknown")
    err_ok = sum(
        1
        for sample in err_samples
        if severity_tone(sample) == "none"
        and sample is not None
        and str(sample.value) in ("0000", "0")
    )
    err_count = err_total - err_ok - err_unknown
    err = aggregate_readout(
        err_samples,
        fallback_text=f"{err_count}/{err_total}",
        emphasis="positive-important" if err_count == 0 else None,
        is_connected=connected,
    )

    return {
        "conn": conn,
        "fullp": fullp,
        "mss": mss,
        "err": err,
        "mss_signal": comp.signal("mss"),
        "err_signal": comp.signal("err"),
    }


def sequencer_pill(read: PvReader, running_pv: str, comp: Component) -> dict[str, Any]:
    """RUNNING / IDLE. Both are normal operating states — neither is good news
    or bad news on its own, so neither is coloured. Only the control system's
    severity (or a dead link) tones this pill.
    """
    sample = read(running_pv)
    running = None
    if sample is not None and sample.ok and sample.value is not None:
        running = sample.value == 1
    fallback = UNKNOWN_TEXT if running is None else ("RUNNING" if running else "IDLE")
    readout = single_readout(
        sample,
        pv_name=running_pv,
        fallback_text=fallback,
        is_connected=read.is_connected,
    )
    return {"readout": readout, "signal": comp.signal("seq")}


def sequence_list(read: PvReader, laser: str) -> dict[str, Any]:
    labels: list[str] = []
    items: list[Readout] = []
    for label, command in SEQUENCES:
        pv_name = sequence_state_pv(laser, command)
        sample = read(pv_name)
        running = None
        if sample is not None and sample.ok and sample.value is not None:
            running = sample.value == 1
        fallback = UNKNOWN_TEXT if running is None else ("RUNNING" if running else "IDLE")
        labels.append(label)
        items.append(
            single_readout(
                sample,
                pv_name=pv_name,
                fallback_text=fallback,
                is_connected=read.is_connected,
            )
        )
    return {"labels": labels, "items": items, "note": None}


def flashlamp_counts(read: PvReader, spec: Config) -> dict[str, Any]:
    counts = {state: 0 for state in FLASHLAMP_STATES}
    uncounted = 0
    for item in spec.flashlamps:
        sample = read(item.pv, Datatype.ENUM_STRING)
        if not is_usable(sample):
            uncounted += 1
            continue
        value = sample.value if sample is not None else None
        state = FLASHLAMP_ALIASES.get(str(value).upper()) if isinstance(value, str) else None
        if state:
            counts[state] += 1

    # The columns no longer add up to the number of channels, so say why on
    # hover. Channels in an uncounted state (IGNITION / BUSY / OFF) are an
    # expected case and are not reported here; the expanded list shows them.
    if not read.is_connected:
        title = TRANSPORT_DOWN_TITLE
    elif uncounted:
        title = (
            f"{uncounted} of {len(spec.flashlamps)} channels have no usable reading "
            f"and are not counted."
        )
    else:
        title = None

    return {
        "states": FLASHLAMP_STATES,
        "counts": counts,
        "title": title,
        # Stale counts grey out with everything else when the link drops.
        "tone": None if read.is_connected else "unknown",
    }


def flashlamp_list(read: PvReader, spec: Config) -> dict[str, Any]:
    """A channel row shows the state name and nothing more. No state is coloured
    here — not even FAILURE: a failed flashlamp is an alarm condition and the
    IOC raises it as one, which the shared table then paints. Colouring it a
    second time from the string would mean two independent notions of "bad".
    """
    labels: list[str] = []
    items: list[Readout] = []
    for item in spec.flashlamps:
        sample = read(item.pv, Datatype.ENUM_STRING)
        labels.append(item.label)
        items.append(
            mapped_readout(sample, pv_name=item.pv, is_connected=read.is_connected)
        )
    return {"labels": labels, "items": items, "note": None}


def trigger_delay(read: PvReader, spec: Config) -> dict[str, Any]:
    """All readouts should be equal (spec). Flag it when they are not.

    These PVs have no alarm limits configured, but INVALID severity (or a
    disconnected channel) on any of them still means the reading cannot be
    trusted, and takes priority over the mismatch check.
    """
    samples = read.many(spec.trigger_delay)
    severity = present_aggregate(samples, is_connected=read.is_connected)
    values = [
        round(sample.value)
        if sample is not None and isinstance(sample.value, (int, float)) and not isinstance(sample.value, bool)
        else None
        for sample in samples
    ]
    known = [value for value in values if value is not None]
    all_known = bool(values) and len(known) == len(values)

    if severity.text is not None:
        return {
            "readout": Readout(
                text=severity.text, tone=severity.tone, title=severity.title, placeholder=True
            )
        }
    if not all_known:
        return {"readout": Readout(text=UNKNOWN_TEXT, tone="unknown", placeholder=True)}
    if len(set(known)) > 1:
        # The one condition no PV can report: the readouts should be equal by
        # spec, and they are not. It gets the reserved 'negative-important' tone
        # and nothing else.
        return {
            "readout": Readout(
                text="MISMATCH " + "/".join(str(value) for value in known),
                tone="negative-important",
                title=" / ".join(str(value) for value in known),
            )
        }
    unit = resolve_units(
        spec.unit("triggerDelay"),
        samples[0].units if samples and samples[0] is not None else None,
        "ns",
    )
    # Raw unless the config says otherwise: delays are whole nanoseconds, so the
    # shared 3-decimal default would turn 790 into 790.000 for everyone who
    # never asked for a format.
    text = format_value(known[0], resolve_format(spec.value_format("triggerDelay"), RAW_FORMAT))
    return {
        "readout": Readout(
            text=text, tone=severity.tone, title=severity.title, units=unit, numeric=True
        )
    }


def modbox_pill(read: PvReader, spec: Config, comp: Component) -> dict[str, Any]:
    """Modbox state is a plain status readout, not a pass/fail signal — no colour
    coding from the raw 1/0 value. 'unknown' (no channel has reported yet) stays
    unpainted too, so "no data" and "all fine" deliberately look the same here.
    """
    samples = read.many(item.pv for item in spec.modbox)
    total = len(spec.modbox)
    ok_count = sum(1 for sample in samples if sample is not None and sample.value == 1)
    severity = present_aggregate(samples, is_connected=read.is_connected)
    tone = None if severity.tone == "unknown" else severity.tone
    if severity.tone == "unknown":
        text = f"{ok_count}/{total}"
    else:
        text = severity.text if severity.text is not None else f"{ok_count}/{total}"
    return {
        "readout": Readout(text=text, tone=tone, title=severity.title),
        "signal": comp.signal("modbox"),
    }


def bias_row(read: PvReader, spec: Config) -> dict[str, Any]:
    pairs: list[dict[str, Any]] = []
    for label, pv_name, role in (
        ("MBC1", spec.pvs.modbox_mbc1, "modboxMbc1"),
        ("MBC2", spec.pvs.modbox_mbc2, "modboxMbc2"),
    ):
        if not pv_name:
            continue
        pairs.append(
            {
                "label": label,
                "readout": number_readout(
                    read(pv_name),
                    pv_name=pv_name,
                    value_format=spec.value_format(role),
                    units=spec.unit(role),
                    is_connected=read.is_connected,
                ),
            }
        )
    return {"pairs": pairs}
