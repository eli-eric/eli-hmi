"""laser-panel — one L4 OPCPA laser: five stacked sections in one column.

The one bespoke component, and the reason the framework has an escape hatch.
Everything about it is specified: the wireframe puts the sequencer, the
overview, the chillers, the flashlamp tally and the Modbox in a fixed order
with fixed groupings, and the aggregates each behave differently. Assembling
that out of `panel` + `value` + `group` + `grid` + `tally` would be forty lines
of YAML per laser to say something a component can say in one.

    - component: laser-panel
      id: NL2
      pvs:
        connection: L4-OPCPA-NL2:PortControl.CNCT
        phdMean: {pv: L4-OPCPA-NL2:PHD1K000:49:Mean, label: PHD1K000:49/Mean}
        …
      chillers: [ … ]
      flashlamps: [ … ]
      commands: { START_LASER: START_LASER, … }

Everything about one signal — its PV, what its row is called, how it is
rounded — is written in that signal's own entry; see `config.py`.

Use it as the model for the *next* bespoke screen: the shape is
`config.py` (schema) + `readings.py` (readings -> context) + this file (widget
wiring) + `panel.html` (layout) + `simulate.py` (PV declarations). A generic
screen needs none of it — that is what `components/value` and friends are for.

Source spec: Confluence — Requirements: L4 OPCPA Control System.
"""

from __future__ import annotations

from dataclasses import replace
from typing import Any

from core.components import (
    Component,
    Datatype,
    PvId,
    PvReader,
    PvSpec,
    WriteLimits,
    register,
)
from core.render import ON_OFF_TEXT, YES_NO_TEXT, mapped_readout, number_readout, string_readout

from .catalog import fetch_catalog
from . import readings
from .config import Config
from .readings import ERR_NOTE, FLASHLAMP_STATES, MSS_NOTE
from .simulate import laser_pv_specs

_NO_LIMITS = WriteLimits()

#: Trigger delay the flashlamp power supplies accept, in nanoseconds.
DELAY_MIN = 10
DELAY_MAX = 60_000

#: YDFA amplifier current, in amps, at the resolution the amplifier takes.
YDFA_MIN = 0
YDFA_MAX = 6
YDFA_PRECISION = 1


@register
class LaserPanel(Component):
    name = "laser-panel"
    summary = "One L4 OPCPA laser: overview, regen, chillers, flashlamps, Modbox."
    Config = Config
    template = "laser_panel/panel.html"
    #: Its own macros (the four-cell overview, the sequence list) are looked up
    #: before the shared ones.
    macros = "laser_panel/widgets.html"

    config: Config
    #: What the Modbox last told us it can load. Empty until `warm` runs, and
    #: after a Modbox that would not answer.
    catalog: list[str]

    async def warm(self) -> None:
        if self.config.waveforms_url:
            self.catalog = await fetch_catalog(self.config.waveforms_url)

    def setup(self) -> None:
        """Declare every live part of one laser.

        Sections whose device bank is empty are omitted — no chillers, no
        Chillers section — and `commands:` gates which buttons the template
        offers. General and Regen always render.
        """
        cfg = self.config
        pvs = cfg.pvs
        self.catalog = []

        # -- Sequencer ------------------------------------------------------
        #
        # Which sequences a laser has is the laser's business, and the pill
        # above them is derived from them: both read the same PVs, so the
        # summary cannot contradict the list it summarises.
        if cfg.sequences:
            sequence_pvs = [PvId(item.pv) for item in cfg.sequences]
            self.seq_signal = self.signal("seq")
            self.add(
                "sequencer_pill",
                "state_pill",
                sequence_pvs,
                lambda read: readings.sequencer_pill(read, cfg, self),
            )
            self.add(
                "sequencer_list",
                "state_list",
                sequence_pvs,
                lambda read: readings.sequence_list(read, cfg),
                show=f"${self.seq_signal}",
            )

        # -- General --------------------------------------------------------
        self.mss_signal = self.signal("mss")
        self.err_signal = self.signal("err")
        self.add(
            "overview",
            "overview",
            [
                PvId(pvs.connection),
                PvId(pvs.full_power),
                *(PvId(item.pv) for item in cfg.mss),
                *(PvId(item.pv) for item in cfg.module_errors),
            ],
            lambda read: readings.overview(read, cfg, self),
        )
        self.add(
            "mss_list",
            "detail_list",
            [PvId(item.pv) for item in cfg.mss],
            self._detail_list(cfg.mss, YES_NO_TEXT, MSS_NOTE),
            show=f"${self.mss_signal}",
        )
        self.add(
            "err_list",
            "detail_list",
            [PvId(item.pv) for item in cfg.module_errors],
            self._detail_list(cfg.module_errors, None, ERR_NOTE),
            show=f"${self.err_signal}",
        )
        self.add("shutter", "pill", [PvId(pvs.shutter)], self._shutter)
        self.add("phd_mean", "value_cell", [PvId(pvs.phd_mean)], self._number(pvs.phd_mean, "phdMean"))

        # -- Regen ----------------------------------------------------------
        # `:State` is an mbbi record: read at its native type Channel Access
        # delivers the numeric index, not OFF/ON/FAILURE, so ask for the name.
        self.add(
            "regen_state",
            "value_cell",
            [PvId(pvs.regen_state, Datatype.ENUM_STRING)],
            self._enum(pvs.regen_state),
        )
        self.add(
            "regen_temp",
            "value_cell",
            [PvId(pvs.regen_temp)],
            self._number(pvs.regen_temp, "regenTemp"),
        )
        if pvs.phd2_mean:
            self.add(
                "phd2_mean",
                "value_cell",
                [PvId(pvs.phd2_mean)],
                self._number(pvs.phd2_mean, "phd2Mean"),
            )
        self.add(
            "attenuator",
            "value_cell",
            [PvId(pvs.attenuator)],
            self._number(pvs.attenuator, "attenuator", integer=True),
        )

        # -- Chillers -------------------------------------------------------
        for index, chiller in enumerate(cfg.chillers):
            for quantity, pv, role in (
                ("flow", chiller.flow, "chillerFlow"),
                ("temp", chiller.temp, "chillerTemp"),
                ("level", chiller.level, "chillerLevel"),
            ):
                # No unit on the cell: a chiller cell is only ~3.9rem wide and a
                # value like "24.810" already fills it, so the unit goes in the
                # column header once (see `panel.html`).
                self.add(
                    f"chiller_{index}_{quantity}",
                    "num_cell",
                    [PvId(pv)],
                    self._number(pv, role, with_units=False),
                )

        # -- Flashlamps -----------------------------------------------------
        if cfg.flashlamps:
            channels = [PvId(item.pv, Datatype.ENUM_STRING) for item in cfg.flashlamps]
            self.fl_signal = self.signal("fl")
            self.add(
                "flashlamp_counts",
                "tally_cells",
                channels,
                lambda read: readings.flashlamp_counts(read, cfg),
            )
            self.add(
                "flashlamp_list",
                "detail_list",
                channels,
                lambda read: readings.flashlamp_list(read, cfg),
                show=f"${self.fl_signal}",
            )
            self.add(
                "trigger_delay",
                "value_cell",
                [PvId(name) for name in cfg.trigger_delay],
                lambda read: readings.trigger_delay(read, cfg),
            )
            if cfg.can("SET_DELAY"):
                # The spec's range for the trigger delay. Declared here, next
                # to the control it belongs to, and enforced by the write
                # endpoint for every route to the PV.
                self.writable(
                    cfg.resolve_command("SET_DELAY").pv_name,
                    min=DELAY_MIN,
                    max=DELAY_MAX,
                    precision=0,
                )

        # -- Modbox ---------------------------------------------------------
        #
        # All of it or none of it. A Modbox is one device: a laser that has one
        # has every part of it, and a laser without one has no section at all —
        # so `modbox` is the single gate, here and in `panel.html`, rather than
        # each row appearing on its own PV.
        if cfg.modbox:
            self.modbox_signal = self.signal("modbox")
            modbox_pvs = [PvId(item.pv) for item in cfg.modbox]
            self.add(
                "modbox_pill",
                "state_pill",
                modbox_pvs,
                lambda read: readings.modbox_pill(read, cfg, self),
            )
            self.add(
                "modbox_list",
                "detail_list",
                modbox_pvs,
                self._detail_list(cfg.modbox, ON_OFF_TEXT, None),
                show=f"${self.modbox_signal}",
            )
            if pvs.modbox_mbc1 or pvs.modbox_mbc2:
                self.add(
                    "bias",
                    "pair_row",
                    [PvId(name) for name in (pvs.modbox_mbc1, pvs.modbox_mbc2) if name],
                    lambda read: readings.bias_row(read, cfg),
                )
            if cfg.can("SEND_YDFA_CURRENT"):
                self.writable(
                    cfg.resolve_command("SEND_YDFA_CURRENT").pv_name,
                    min=YDFA_MIN,
                    max=YDFA_MAX,
                    precision=YDFA_PRECISION,
                )
            self.add(
                "waveform_preset",
                "value_cell",
                [PvId(pvs.loaded_waveform)],
                self._text(pvs.loaded_waveform, initialises=True),
            )
            if pvs.latest_waveform:
                self.add(
                    "waveform_latest",
                    "value_cell",
                    [PvId(pvs.latest_waveform)],
                    self._text(pvs.latest_waveform),
                )

    # -- small readings ----------------------------------------------------

    def _shutter(self, read: PvReader) -> dict[str, Any]:
        pv = self.config.pvs.shutter
        return {
            "readout": readings.bool_readout(
                read(pv),
                pv_name=pv,
                on_label="is OPEN",
                off_label="is CLOSED",
                is_connected=read.is_connected,
            )
        }

    def _number(
        self,
        pv: str,
        role: str,
        *,
        units_fallback: str | None = None,
        integer: bool = False,
        with_units: bool = True,
    ):
        cfg = self.config

        def build(read: PvReader) -> dict[str, Any]:
            readout = number_readout(
                read(pv),
                pv_name=pv,
                value_format=cfg.value_format(role),
                units=cfg.unit(role) if with_units else None,
                units_fallback=(
                    units_fallback or cfg.default_unit(role) if with_units else None
                ),
                integer=integer,
                is_connected=read.is_connected,
            )
            if not with_units and readout.units:
                # The reading carries its own EGU, but this cell's column header
                # already shows it — see the chiller grid in `panel.html`.
                readout = replace(readout, units=None)
            return {"readout": readout}

        return build

    def _enum(self, pv: str):
        def build(read: PvReader) -> dict[str, Any]:
            return {
                "readout": string_readout(
                    read(pv, Datatype.ENUM_STRING), pv_name=pv, is_connected=read.is_connected
                )
            }

        return build

    def _text(self, pv: str, *, initialises: bool = False):
        """`initialises` for a record that is undefined until the device
        writes it: the waveform preset arrives when the Modbox initialises and
        reads UDF until then. See `readings.as_initialised`."""

        def build(read: PvReader) -> dict[str, Any]:
            sample = read(pv)
            if initialises:
                sample = readings.as_initialised(sample)
            return {
                "readout": string_readout(
                    sample, pv_name=pv, is_connected=read.is_connected
                )
            }

        return build

    def _detail_list(self, items, defaults, note):
        def build(read: PvReader) -> dict[str, Any]:
            return {
                "labels": [item.label for item in items],
                "items": [
                    mapped_readout(
                        read(item.pv),
                        pv_name=item.pv,
                        values=getattr(item, "values", None),
                        defaults=defaults,
                        is_connected=read.is_connected,
                    )
                    for item in items
                ],
                "note": note,
            }

        return build

    # -- declarations ------------------------------------------------------

    def pv_specs(self) -> list[PvSpec]:
        return laser_pv_specs(self.config)

    def context(self) -> dict[str, Any]:
        """Everything the layout template needs beyond the widgets.

        Command *targets* are resolved here rather than in the template: which
        PV a button writes, and what it writes, is a decision the config makes
        (`resolve_command`), and a template is a bad place to re-derive it.
        """
        cfg = self.config
        return {
            "states": FLASHLAMP_STATES,
            # What this laser calls each row; see `LABEL_DEFAULTS`.
            "labels": cfg.row_labels(),
            # Where the waveform options live in the DOM, and what to ask when
            # the control is opened — the Modbox's list changes while the
            # machine runs, so one fetch at start-up is not enough.
            # Marks every control showing this laser's catalog, so one patch
            # refreshes all of them.
            "waveform_catalog": f"{self.key}-waveforms",
            "waveforms_url": f"/api/waveforms?component={self.key}",
            # What the Modbox serves, when it is configured to serve one;
            # otherwise the list in the config.
            # Alphabetical, whichever list it is: a Modbox answers in the
            # order its own store holds — the order waveforms were created —
            # and an operator looking for one name in a drop-down is reading,
            # not browsing. Case does not decide the order, or `Broad` would
            # sort away from `broad`.
            "waveforms": sorted(
                self.catalog if cfg.waveforms_url else cfg.waveforms,
                key=lambda name: (name.lower(), name),
            ),
            "signals": {
                "seq": getattr(self, "seq_signal", None),
                "mss": self.mss_signal,
                "err": self.err_signal,
                "fl": getattr(self, "fl_signal", None),
                "modbox": getattr(self, "modbox_signal", None),
            },
            # A command's write target and the bounds declared for it, so the
            # template never re-derives either.
            "cmd": {
                command: {
                    "pv": cfg.resolve_command(command).pv_name,
                    "value": cfg.resolve_command(command).value,
                    "min": self.limits.get(cfg.resolve_command(command).pv_name, _NO_LIMITS).min,
                    "max": self.limits.get(cfg.resolve_command(command).pv_name, _NO_LIMITS).max,
                    "precision": self.limits.get(
                        cfg.resolve_command(command).pv_name, _NO_LIMITS
                    ).precision,
                }
                for command in cfg.command_names
            },
        }
