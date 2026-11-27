"""register-tree — every module of one device, and every register under it.

The panel shows what an operator watches; this shows everything the device
has. It takes the panel's place, at the panel's width, when the panel's
Registers button asks for it, and holds its own stream — which is the point:
the screen never carries hundreds of register rows, and they are streamed only
while someone has the tree open. Back removes it, which closes the stream.

Not written in YAML directly, though nothing stops it: `laser-panel` builds
one from its own `modules:` block, because the modules belong to the laser and
configuring them twice is how the two would come to disagree. It builds a
second one for its ModBox, from the fixed table in `laser_panel/modbox.py` and
the laser's `$(P)`, with nothing writable and no refresh. Either way every
register arrives already named.
"""

from __future__ import annotations

from typing import Any

from pydantic import Field

from components.laser_panel.config import Module
from core.components import (
    Component,
    ComponentConfig,
    Datatype,
    PvId,
    PvReader,
    WriteRule,
    register,
    slug,
)
from core.render import (
    ValueFormatOptions,
    bool_readout,
    number_readout,
    string_readout,
)

#: How a register's declared kind is read from Channel Access.
#:
#: The kind is the one thing that decides this, and there are three answers.
#: A record with named states — mbbi/mbbo, and bi/bo, whose ZNAM/ONAM are
#: states like any other — is read by name: at its native type it delivers an
#: index where the row should say RUN. A numeric register is asked for as a
#: number whatever record the device used, so a column of readings is one
#: kind of value. A string is a string.
DATATYPES = {
    "enum": Datatype.ENUM_STRING,
    "bool": Datatype.ENUM_STRING,
    "string": Datatype.STRING,
    "int": Datatype.NUMBER,
    "float": Datatype.NUMBER,
}

#: The kinds whose value is one of the record's named states: drawn as the
#: name, written by choosing one.
NAMED_STATES = {"enum", "bool"}

#: The kinds whose records have control fields worth reading — a unit, drive
#: limits, state strings. A string record has none: DBR_CTRL_STRING carries
#: the value and its alarm state and nothing else, so asking costs a read and
#: answers nothing.
HAS_CONTROL_FIELDS = {"float", "int", "enum", "bool"}


def process_pv(pv: str) -> str:
    """The field that processes a register's record: writing 1 to it makes
    the device be read now rather than at the record's next scan."""
    return f"{pv}.PROC"


class Config(ComponentConfig):
    title: str = Field(description="What the view is called, e.g. 'NL2 registers'.")
    modules: list[Module] = Field(
        default_factory=list,
        description="The device's modules, each a label and the registers "
        "under it, every register already named. Built by `laser-panel` from "
        "its own `modules:` block.",
    )
    nv_write: str | None = Field(
        default=None,
        description="PV that arms writing to non-volatile memory, one per laser.",
    )
    refresh: bool = Field(
        default=True,
        description="Whether every register has a button that reads it again "
        "(writes 1 to its `.PROC`). Off for a ModBox, whose registers are "
        "only watched.",
    )


@register
class RegisterTree(Component):
    name = "register-tree"
    summary = "Every module of one device, and every register under it."
    Config = Config
    template = "register_tree/tree.html"
    #: Its own macros (the non-volatile arming control) are looked up here
    #: first, then in the shared `components/templates/readouts.html`.
    macros = "register_tree/widgets.html"

    config: Config

    #: Each register's EGU, as its record reported it. Kept as data, not
    #: baked into a widget: it is answered at start-up and again whenever a
    #: channel comes back, and the next draw of the row simply uses it.
    _units: dict[str, str]
    #: Each float register's decimals, from its record's PREC, the same way.
    _decimals: dict[str, int]

    def setup(self) -> None:
        if not hasattr(self, "_units"):
            self._units = {}
        if not hasattr(self, "_decimals"):
            self._decimals = {}
        self._module_signals: dict[int, str] = {}
        # Which register's write panel is open, in this browser. One panel is
        # filled and shown; the others stay hidden with whatever they last
        # held, which nobody can reach and the next selection replaces.
        self.selected = self.signal("selected", "")
        # The value being written, declared here and not by the panel: a panel
        # is patched in later, and a control bound to a signal that does not
        # exist yet cannot report what was chosen.
        self.set_register = self.signal("set_register", "")
        # Where a failed NV write is reported. Its own element, beside the
        # box but not part of the box's widget: a refused write redraws the
        # widget to put the box right, and would wipe a message inside it.
        self.nv_status = f"{self.key}-nv-status"
        if self.config.nv_write:
            self.writable(self.config.nv_write)
            self.add(
                "nv",
                "nv_toggle",
                [PvId(self.config.nv_write)],
                self._nv_state,
            )
        for module_index, module in enumerate(self.config.modules):
            # One signal per module: a tree of hundreds is unreadable with
            # everything open, so a module's registers start collapsed. The
            # name is kept as `signal` returned it — deriving it a second time
            # in `context` is how a declaration and its use come to disagree.
            self._module_signals[module_index] = self.signal(
                f"module_{module_index}", False
            )
            for register_index, item in enumerate(module.registers):
                # Every register can be read again on demand, unless the tree
                # says otherwise. 1 and nothing else: the button sends 1, and
                # anything that can post to the endpoint can post anything.
                if self.config.refresh:
                    # Shared: processing a record changes nothing on the
                    # device, so any desk may ask for a fresh reading,
                    # whoever controls the laser.
                    self.writable(
                        process_pv(item.pv), WriteRule.integer(min=1, max=1), exclusive=False
                    )
                if item.write:
                    # Part of the laser's control: its rule is the device's,
                    # read when the register is selected (`write_rule`).
                    self.writable(item.write_pv)
                # At the datatype the register's kind asks for, so the first
                # reading to arrive is already the right kind of value.
                pv = PvId(item.pv, DATATYPES.get(item.kind, Datatype.NUMBER))
                self.add(
                    f"r{module_index}_{register_index}",
                    "value_cell",
                    [pv],
                    self._reading(item),
                )

    def _reading(self, item):
        """One register's latest value, rendered the way its kind says.

        The same word that chose the datatype chooses the readout, so what
        arrives and what is drawn cannot disagree: an `enum` was asked for by
        name and is drawn as one, a number was asked for as a number.
        """

        def build(read: PvReader) -> dict[str, Any]:
            sample = read(item.pv, DATATYPES.get(item.kind, Datatype.NUMBER))
            if item.kind in NAMED_STATES or item.kind == "string":
                # The record's own name for the state, as it arrived.
                readout = string_readout(
                    sample, pv_name=item.pv, is_connected=read.is_connected
                )
            else:
                readout = number_readout(
                    sample,
                    pv_name=item.pv,
                    # The record's own EGU. Not the zone file's `units:` as a
                    # stand-in when the record has not answered: two sources
                    # for one unit is how a row comes to say °C for a record
                    # that reads in K.
                    units=self._units.get(item.pv),
                    # The record's PREC, for a float; one whose record has not
                    # answered keeps the HMI's default of three. An integer
                    # record sends no PREC, and an `int` register is drawn
                    # whole even when its record is a double that does.
                    value_format=self._format(item),
                    integer=item.kind == "int",
                    is_connected=read.is_connected,
                )
            return {"readout": readout}

        return build

    def _nv_state(self, read: PvReader) -> dict[str, Any]:
        """What the device is armed to do, as the device reports it.

        `known` is whether the channel answers at all. The box is the only
        element, so it has to carry the case a chip used to — a channel that
        is disconnected — and an unticked box that can still be pressed would
        read as 'volatile', the dangerous way to be wrong.

        Severity is deliberately not part of it. This is a write PV: it is
        processed only when written, so a write is the one thing that clears
        its severity, and one never written since the IOC started is UDF and
        INVALID as a matter of course. Disabling the box for that would leave
        it INVALID for good. The value is shown as it is.
        """
        pv = self.config.nv_write
        sample = read(pv)
        known = bool(
            read.is_connected
            and sample is not None
            and sample.ok
            and sample.value is not None
        )
        readout = bool_readout(
            sample,
            pv_name=pv,
            on_label="armed",
            off_label="volatile",
            is_connected=read.is_connected,
        )
        return {
            "pv": pv,
            "armed": known and sample.value == 1,
            "known": known,
            # Why the box is dead, for the tooltip. The readout already knows
            # how to say it, so the wording matches every other PV DSC.
            "why": None if known else (readout.title or readout.text),
            "status": self.nv_status,
        }

    def describes(self) -> tuple[str, ...]:
        """Every register that has control fields: its unit is in them, and a
        time-stamped monitor update does not carry it."""
        return tuple(
            item.pv
            for module in self.config.modules
            for item in module.registers
            if self.has_control_fields(item)
        )

    @staticmethod
    def has_control_fields(item: Any) -> bool:
        """Whether this register's record has control fields to read — at
        start-up for its unit, and on selection for its limits and states."""
        return item.kind in HAS_CONTROL_FIELDS

    def described(self, descriptions: dict[str, Any]) -> None:
        """What the records said: a unit, and a float's PREC. Answered at
        start-up and again when a channel comes back, so a record that says
        nothing now forgets what it said before rather than keeping a unit it
        may no longer have."""
        for pv, description in descriptions.items():
            if description.units:
                self._units[pv] = description.units
            else:
                self._units.pop(pv, None)
            if description.precision is not None:
                # Held to what a fixed format can take: PREC is the device's
                # to set, and a negative one would fail at render time.
                self._decimals[pv] = min(max(description.precision, 0), 100)
            else:
                self._decimals.pop(pv, None)

    def _format(self, item: Any) -> ValueFormatOptions | None:
        """How a float register's reading is rounded: to its record's PREC,
        once the record has said. None leaves the readout's own default —
        three decimals for a float, whole for an `int`, whose record (a
        longin, DBR_CTRL_LONG) sends no PREC to use."""
        decimals = self._decimals.get(item.pv)
        if item.kind != "float" or decimals is None:
            return None
        return ValueFormatOptions(format="fixed", to_fixed=decimals)

    def write_rule(self, item: Any, described: Any) -> WriteRule:
        """What a write to this register is held to.

        The *kind* is the register's own declaration — the same word that
        chose the datatype it is monitored at. The names and bounds in it are
        the device's, read just now. Nothing here infers the kind from what
        the device happened to answer: an enum whose module is powered down
        would otherwise become a numeric field for the rest of the shift.
        """
        if item.kind in NAMED_STATES:
            return WriteRule.choice(described.states)
        if item.kind == "int":
            return WriteRule.integer(min=described.low, max=described.high)
        if item.kind == "string":
            return WriteRule.text()
        return WriteRule.number(
            min=described.low, max=described.high, precision=described.precision
        )

    def slot(self, pv: str) -> str:
        """The element id of this register's write panel.

        Under its own row rather than at the foot of a tree hundreds of rows
        long, where it would be off-screen from the register it belongs to.
        """
        return f"{self.key}-write-{slug(pv, '-')}"

    def register(self, pv: str) -> Any:
        """The register at this PV, or None. What the write panel is built
        from when one is selected."""
        for module in self.config.modules:
            for item in module.registers:
                if item.pv == pv:
                    return item
        return None

    def context(self) -> dict[str, Any]:
        return {
            "modules": [
                {
                    "label": module.label,
                    "signal": self._module_signals[module_index],
                    "registers": [
                        {
                            "label": item.label or item.name,
                            "pv": item.pv,
                            "process": process_pv(item.pv),
                            "write": item.write,
                            "write_pv": item.write_pv,
                            "widget": f"r{module_index}_{register_index}",
                            "slot": self.slot(item.pv),
                        }
                        for register_index, item in enumerate(module.registers)
                    ],
                }
                for module_index, module in enumerate(self.config.modules)
            ],
            # What asks for a panel. One is filled at a time — a control on
            # every row would mean asking the device for hundreds of sets of
            # limits nobody is looking at — but each register has its own slot
            # so the panel appears under the row it writes.
            "selected_signal": self.selected,
            "refresh": self.config.refresh,
            "select_url": f"/api/register?component={self.key}",
        }
