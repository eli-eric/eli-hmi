"""The live parts of the L4 OPCPA page, as a registry of **widgets**.

A widget is the smallest piece of the page that has to change when a PV changes:
one value cell, one summary pill, one expanded list. It knows three things — its
DOM `id`, the PVs it reads, and how to turn the latest readings into a template
context.

That triple is what replaces `useWebSocketData`. Instead of a component
subscribing in the browser and re-rendering itself, the server holds the
subscription, notices which widgets a changed PV belongs to, re-renders exactly
those, and sends them down the SSE stream as Datastar `patch-elements` events.
The browser runs no application code at all.

Two consequences shaped the decomposition:

* **A widget owns no interactive markup.** Labels, cog buttons, inputs and
  preset chips are rendered once by the panel template and never patched, so a
  patch can never land in the middle of an operator typing a setpoint. A widget
  is the value cell, not the row.
* **Granularity is a bandwidth decision.** One widget per section would repaint
  ~3 kB every time any of forty PVs twitched; one per PV would mean ~200 ids per
  laser. A row/cell is the unit an operator reads, and it is also the unit that
  changes, so it is the unit that is patched.

Expandable regions (MSS, module errors, flashlamp channels, Modbox, Sequencer)
are always rendered and carry `data-show` on the widget element itself. Their
open/closed state is a Datastar signal in the browser, so expanding costs no
round-trip and a patch cannot collapse a list the operator just opened.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Any, Callable, Iterable, Mapping

from app.epics.types import Datatype, PvId, PvSample
from app.presentation.formatting import RAW_FORMAT, format_value, resolve_format, resolve_units
from app.presentation.readouts import (
    Readout,
    aggregate_readout,
    bool_readout,
    is_usable,
    mapped_readout,
    number_readout,
    single_readout,
    string_readout,
)
from app.presentation.severity import (
    TRANSPORT_DOWN_TITLE,
    UNKNOWN_TEXT,
    present_aggregate,
    severity_tone,
)
from app.presentation.value_text import ON_OFF_TEXT, YES_NO_TEXT

from .config import LaserSpec
from .pv_names import sequence_state_pv

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


class PvReader:
    """Read-only view of the latest readings, handed to every context builder.

    `is_connected` is the server-side half of the old transport flag: with the
    EPICS link down every readout greys out and keeps its last value, rather
    than continuing to look live. (The browser-side half — "is this SSE stream
    still alive" — is the `$_age` watchdog in the page template.)
    """

    __slots__ = ("_samples", "is_connected")

    def __init__(self, samples: Mapping[PvId, PvSample | None], is_connected: bool = True):
        self._samples = samples
        self.is_connected = is_connected

    def __call__(self, name: str, datatype: Datatype = Datatype.NATIVE) -> PvSample | None:
        return self._samples.get(PvId(name, datatype))

    def many(
        self, names: Iterable[str], datatype: Datatype = Datatype.NATIVE
    ) -> list[PvSample | None]:
        return [self(name, datatype) for name in names]


@dataclass(frozen=True)
class Widget:
    """One patchable element."""

    id: str
    #: Macro in `templates/l4_opcpa/widgets.html` that renders it.
    macro: str
    pvs: tuple[PvId, ...]
    build: Callable[[PvReader], dict[str, Any]]
    #: Datastar expression for `data-show`, for the expandable regions.
    show: str | None = None


@dataclass
class PanelModel:
    """Everything the panel template needs for one laser: the static structure,
    and the widgets that fill in the live parts.
    """

    spec: LaserSpec
    widgets: dict[str, Widget] = field(default_factory=dict)

    @property
    def laser(self) -> str:
        return self.spec.laser

    def signal(self, name: str) -> str:
        """Datastar signal name scoped to this laser. PV names cannot appear in
        a signal, so the laser id plus a role is the whole namespace.
        """
        return f"{_slug(self.laser)}_{name}"

    def signals(self) -> dict[str, Any]:
        """Every Datastar signal this panel's markup references, with its
        initial value.

        Declared up front in one `data-signals` on the page rather than created
        ad hoc by the first attribute that mentions them: a signal that only
        exists once a button has been clicked makes `data-show` evaluate against
        `undefined` on first paint, which is how an expandable list ends up
        rendered open.
        """
        signals: dict[str, Any] = {}
        # Expandable regions, all closed on load.
        for region in ("seq", "mss", "err", "fl", "modbox"):
            signals[self.signal(region)] = False
        # Cog panels.
        for cog in (
            "shutter",
            "general",
            "atten",
            "flashlamps",
            "delay",
            "waveform",
            "modbox_actions",
        ):
            signals[self.signal(f"cog_{cog}")] = False
        # Operator-supplied values, bound to their input fields.
        signals[self.signal("atten_value")] = ""
        signals[self.signal("delay_value")] = ""
        signals[self.signal("wave_value")] = ""
        return signals

    def command(self, name: str) -> dict[str, Any]:
        """A command's write target, ready for a button's `data-on-click`."""
        target = self.spec.resolve_command(name)
        return {"pv": target.pv_name, "value": target.value}

    def has_any_command(self, *names: str) -> bool:
        return any(self.spec.can(name) for name in names)

    @property
    def all_pvs(self) -> set[PvId]:
        pvs: set[PvId] = set()
        for widget in self.widgets.values():
            pvs.update(widget.pvs)
        return pvs


def _slug(text: str) -> str:
    return "".join(character if character.isalnum() else "_" for character in text)


def widget_id(laser: str, role: str) -> str:
    return f"w-{_slug(laser)}-{_slug(role)}"


# ---------------------------------------------------------------------------
# Widget construction
# ---------------------------------------------------------------------------


def build_panel(spec: LaserSpec) -> PanelModel:
    """Assemble the widget registry for one laser.

    Mirrors `laser-panel-instance.tsx`: sections whose device bank is empty are
    omitted (no chillers -> no Chillers widgets), General and Regen always
    render, and `commands` gates which action buttons the template offers.
    """
    panel = PanelModel(spec=spec)
    add = panel.widgets.__setitem__
    laser = spec.laser
    pvs = spec.pvs

    def wid(role: str) -> str:
        return widget_id(laser, role)

    # -- Sequencer -----------------------------------------------------------
    if pvs.sequencer_running:
        running_pv = pvs.sequencer_running
        sequence_pvs = tuple(
            PvId(sequence_state_pv(laser, command)) for _, command in SEQUENCES
        )
        add(
            "sequencer_pill",
            Widget(
                id=wid("sequencer_pill"),
                macro="state_pill",
                pvs=(PvId(running_pv),),
                build=lambda read: _sequencer_pill(read, running_pv, panel),
            ),
        )
        add(
            "sequencer_list",
            Widget(
                id=wid("sequencer_list"),
                macro="sequence_list",
                pvs=sequence_pvs,
                build=lambda read: _sequence_list(read, laser),
                show=f"${panel.signal('seq')}",
            ),
        )

    # -- General -------------------------------------------------------------
    overview_pvs = (
        PvId(pvs.connection),
        PvId(pvs.full_power),
        *(PvId(item.pv) for item in spec.mss),
        *(PvId(item.pv) for item in spec.module_errors),
    )
    add(
        "overview",
        Widget(
            id=wid("overview"),
            macro="overview",
            pvs=overview_pvs,
            build=lambda read: _overview(read, spec, panel),
        ),
    )
    add(
        "mss_list",
        Widget(
            id=wid("mss_list"),
            macro="detail_list",
            pvs=tuple(PvId(item.pv) for item in spec.mss),
            build=lambda read: {
                "items": [
                    mapped_readout(
                        read(item.pv),
                        pv_name=item.pv,
                        values=item.values,
                        defaults=YES_NO_TEXT,
                        is_connected=read.is_connected,
                    )
                    for item in spec.mss
                ],
                "labels": [item.label for item in spec.mss],
                "note": MSS_NOTE,
            },
            show=f"${panel.signal('mss')}",
        ),
    )
    add(
        "err_list",
        Widget(
            id=wid("err_list"),
            macro="detail_list",
            pvs=tuple(PvId(item.pv) for item in spec.module_errors),
            build=lambda read: {
                "items": [
                    mapped_readout(
                        read(item.pv), pv_name=item.pv, is_connected=read.is_connected
                    )
                    for item in spec.module_errors
                ],
                "labels": [item.label for item in spec.module_errors],
                "note": ERR_NOTE,
            },
            show=f"${panel.signal('err')}",
        ),
    )
    add(
        "shutter",
        Widget(
            id=wid("shutter"),
            macro="pill",
            pvs=(PvId(pvs.shutter),),
            build=lambda read: {
                "readout": bool_readout(
                    read(pvs.shutter),
                    pv_name=pvs.shutter,
                    on_label="is OPEN",
                    off_label="is CLOSED",
                    is_connected=read.is_connected,
                )
            },
        ),
    )
    add(
        "phd_mean",
        _number_widget(wid("phd_mean"), spec, pvs.phd_mean, role="phdMean"),
    )

    # -- Regen ---------------------------------------------------------------
    # `:State` is an mbbi record: read at its native type Channel Access
    # delivers the numeric index, not OFF/ON/Failure, so ask for the state name.
    regen_state_pv = PvId(pvs.regen_state, Datatype.ENUM_STRING)
    add(
        "regen_state",
        Widget(
            id=wid("regen_state"),
            macro="value_cell",
            pvs=(regen_state_pv,),
            build=lambda read: {
                "readout": string_readout(
                    read(pvs.regen_state, Datatype.ENUM_STRING),
                    pv_name=pvs.regen_state,
                    is_connected=read.is_connected,
                )
            },
        ),
    )
    add(
        "regen_temp",
        _number_widget(
            wid("regen_temp"), spec, pvs.regen_temp, role="regenTemp", units_fallback="°C"
        ),
    )
    add(
        "phd2_mean",
        _number_widget(wid("phd2_mean"), spec, pvs.phd2_mean, role="phd2Mean"),
    )
    add(
        "attenuator",
        _number_widget(
            wid("attenuator"), spec, pvs.attenuator, role="attenuator", integer=True
        ),
    )

    # -- Chillers ------------------------------------------------------------
    for index, chiller in enumerate(spec.chillers):
        for quantity, pv_name, role in (
            ("flow", chiller.flow, "chillerFlow"),
            ("temp", chiller.temp, "chillerTemp"),
            ("level", chiller.level, "chillerLevel"),
        ):
            key = f"chiller_{index}_{quantity}"
            # No unit on the cell: a chiller cell is only ~3.9rem wide and a
            # value like "24.810" already fills it, so the unit goes in the
            # column header once (see `panel.html`).
            add(
                key,
                _number_widget(
                    wid(key), spec, pv_name, role=role, cell="num_cell", with_units=False
                ),
            )

    # -- Flashlamps ----------------------------------------------------------
    if spec.flashlamps:
        channel_pvs = tuple(
            PvId(item.pv, Datatype.ENUM_STRING) for item in spec.flashlamps
        )
        add(
            "flashlamp_counts",
            Widget(
                id=wid("flashlamp_counts"),
                macro="flashlamp_counts",
                pvs=channel_pvs,
                build=lambda read: _flashlamp_counts(read, spec),
            ),
        )
        add(
            "flashlamp_list",
            Widget(
                id=wid("flashlamp_list"),
                macro="detail_list",
                pvs=channel_pvs,
                build=lambda read: _flashlamp_list(read, spec),
                show=f"${panel.signal('fl')}",
            ),
        )
        add(
            "trigger_delay",
            Widget(
                id=wid("trigger_delay"),
                macro="value_cell",
                pvs=tuple(PvId(name) for name in spec.trigger_delay),
                build=lambda read: _trigger_delay(read, spec),
            ),
        )

    # -- Modbox --------------------------------------------------------------
    if spec.modbox:
        modbox_pvs = tuple(PvId(item.pv) for item in spec.modbox)
        add(
            "modbox_pill",
            Widget(
                id=wid("modbox_pill"),
                macro="state_pill",
                pvs=modbox_pvs,
                build=lambda read: _modbox_pill(read, spec, panel),
            ),
        )
        add(
            "modbox_list",
            Widget(
                id=wid("modbox_list"),
                macro="detail_list",
                pvs=modbox_pvs,
                build=lambda read: {
                    "items": [
                        mapped_readout(
                            read(item.pv),
                            pv_name=item.pv,
                            values=item.values,
                            defaults=ON_OFF_TEXT,
                            is_connected=read.is_connected,
                        )
                        for item in spec.modbox
                    ],
                    "labels": [item.label for item in spec.modbox],
                    "note": None,
                },
                show=f"${panel.signal('modbox')}",
            ),
        )
        if pvs.modbox_mbc1 or pvs.modbox_mbc2:
            bias_pvs = tuple(
                PvId(name) for name in (pvs.modbox_mbc1, pvs.modbox_mbc2) if name
            )
            add(
                "bias",
                Widget(
                    id=wid("bias"),
                    macro="bias_row",
                    pvs=bias_pvs,
                    build=lambda read: _bias_row(read, spec),
                ),
            )
        add(
            "waveform_preset",
            Widget(
                id=wid("waveform_preset"),
                macro="value_cell",
                pvs=(PvId(pvs.loaded_waveform),),
                build=lambda read: {
                    "readout": string_readout(
                        read(pvs.loaded_waveform),
                        pv_name=pvs.loaded_waveform,
                        is_connected=read.is_connected,
                    )
                },
            ),
        )
        if pvs.latest_waveform:
            latest = pvs.latest_waveform
            add(
                "waveform_latest",
                Widget(
                    id=wid("waveform_latest"),
                    macro="value_cell",
                    pvs=(PvId(latest),),
                    build=lambda read: {
                        "readout": string_readout(
                            read(latest), pv_name=latest, is_connected=read.is_connected
                        )
                    },
                ),
            )

    return panel


def _number_widget(
    element_id: str,
    spec: LaserSpec,
    pv_name: str,
    *,
    role: str,
    units_fallback: str | None = None,
    integer: bool = False,
    cell: str = "value_cell",
    with_units: bool = True,
) -> Widget:
    """A numeric readout wired to its config role (units + format)."""

    def build(read: PvReader) -> dict[str, Any]:
        readout = number_readout(
            read(pv_name),
            pv_name=pv_name,
            value_format=spec.value_format(role),
            units=spec.unit(role) if with_units else None,
            units_fallback=units_fallback if with_units else None,
            integer=integer,
            is_connected=read.is_connected,
        )
        if not with_units and readout.units:
            readout = replace(readout, units=None)
        return {"readout": readout}

    return Widget(id=element_id, macro=cell, pvs=(PvId(pv_name),), build=build)


# ---------------------------------------------------------------------------
# Context builders — the logic that used to live in each section component
# ---------------------------------------------------------------------------


def _overview(read: PvReader, spec: LaserSpec, panel: PanelModel) -> dict[str, Any]:
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
        "mss_signal": panel.signal("mss"),
        "err_signal": panel.signal("err"),
    }


def _sequencer_pill(read: PvReader, running_pv: str, panel: PanelModel) -> dict[str, Any]:
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
    return {"readout": readout, "signal": panel.signal("seq")}


def _sequence_list(read: PvReader, laser: str) -> dict[str, Any]:
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


def _flashlamp_counts(read: PvReader, spec: LaserSpec) -> dict[str, Any]:
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


def _flashlamp_list(read: PvReader, spec: LaserSpec) -> dict[str, Any]:
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


def _trigger_delay(read: PvReader, spec: LaserSpec) -> dict[str, Any]:
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


def _modbox_pill(read: PvReader, spec: LaserSpec, panel: PanelModel) -> dict[str, Any]:
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
        "signal": panel.signal("modbox"),
    }


def _bias_row(read: PvReader, spec: LaserSpec) -> dict[str, Any]:
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
