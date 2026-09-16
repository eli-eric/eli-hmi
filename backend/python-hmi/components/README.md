# components — the vocabulary a screen is written in

A **component** is a reusable piece of screen, written once in Python and then
used any number of times from YAML. Building a screen does not mean opening this
folder: it means picking components and configuring them under
[`../zones/`](../zones/README.md). You come in here to add a new *kind* of thing
a screen can show.

| Component | What it is |
| --- | --- |
| `panel` | A titled box that groups other components. The only container. |
| `value` | One row: label, reading, optional buttons and setpoint. Most of any screen is these. |
| `group` | Several related signals as one pill that expands into a list — twenty error codes, eight interlocks. |
| `grid` | A table of readings: devices down the side, quantities across the top. |
| `tally` | How many channels are in each state, expanding into the per-channel detail. |
| `motor` | A motor: position, setpoint, jog presets, stop, limit switches. |
| `valve` | A valve: state, Open and Close. The smallest one — copy it. |
| `laser-panel` | One L4 OPCPA laser. The one bespoke component, and the escape hatch. |

Every setting of every component is documented in its `Config` class, which is
also what produces the error message when a screen misconfigures it. Read the
module docstring first: each one opens with the YAML that uses it.

## Writing a component

Four things, and the rest of the framework never needs to know which component
it is dealing with (the full contract is in
[`../core/components.py`](../core/components.py)):

```python
@register
class Valve(Component):
    name = "valve"                      # what YAML calls it
    Config = Config                     # a pydantic model for its YAML block
    template = "valve/valve.html"       # static markup + widget slots

    def setup(self) -> None:            # declare the live parts
        self.add("state", "pill", [PvId(self.config.pv, Datatype.ENUM_STRING)], self._state)

    def pv_specs(self) -> list[PvSpec]:  # say what each PV *is*
        return [PvSpec(name=self.config.pv, kind="enum", states=STATES, ...)]
```

A folder with an `__init__.py` is a component; importing `components` imports
all of them, which is how they register. There is no list to keep in step.

### The five rules that matter

**1. A widget is a value cell, never a whole row.** Labels, buttons and inputs
are rendered once with the page and never patched, so an SSE update cannot land
in the middle of an operator typing a setpoint or close a panel they just
opened. `self.add(...)` declares the cell; the template puts the label and the
cog around it.

**2. Never decide colour.** Ask `core.render` for a `Readout` and emit the tone
it gives you. The tone layer in `core/static/css/hmi.css` decides what a tone
looks like, and `core/render/severity.py` is the only thing that decides *which*
tone applies — transport loss beats EPICS severity beats a component's own
emphasis. That ordering is why a component cannot paint over an alarm.

**3. Declare every PV you read.** `pv_specs()` is what the simulator invents
values from and what `ioc/generate.py` turns into a real EPICS record. A
component that reads an undeclared PV works against the real network and shows
`<>` for ever anywhere else — found late, and in the worst place.
`tests/test_components.py` fails a component that forgets one.

**4. Say what a setting is for, not what it is.** The field descriptions are the
component's documentation as far as a controls engineer is concerned: they are
what the error message shows. "Which state is good news, and therefore green"
beats "the good state".

**5. Never decide width either.** A reading sits in a fixed field
(`--hmi-value-width`, 7.5rem), not the rest of the row. Two reasons, and both
are about reading a card rather than a line: a one-word state stretched across a
panel reads as emphasis nobody meant, and readings all one width can be scanned
down a column, decimals included. Call `rows.row(...)` and you get this for
free. A cell that genuinely carries more than a reading — two channels with
their own labels — passes `wide=true` and takes the rest of the card; a screen
author can ask for the same with `wide: true` in YAML. Anything you reach for
beyond those two belongs in a review, not in a template.

### Declaring a command

A button that triggers a chain of writes — one press, many records — is one
`PvSpec`:

```python
PvSpec(
    name=cfg.open_pv, kind="int", command=True, value=1,
    effects=((cfg.pv, OPEN),),      # what the press writes
    busy=(cfg.moving_pv,),          # held at 1 while it runs
    busy_seconds=2.0,
)
```

The simulator applies the writes; `ioc/generate.py` renders the same declaration
as a `bo` record whose FLNK fires a `seq` with a delayed release step — and
collapses "one value to many records" into a `dfanout`. Neither of them needs
changing when you add a component.

### Shared pieces

- `components/common.py` — `Readable` (label, pv, units, format, range, alarm,
  demo, actions, setpoint), `Action`, `Setpoint`, and the helpers that turn them
  into `PvSpec`s. Inherit `Readable` and `units:` means the same thing in your
  component as everywhere else.
- `components/templates/readouts.html` — every widget macro: `value_cell`,
  `num_cell`, `pill`, `state_pill`, `detail_list`, `state_list`, `tally_cells`,
  `pair_row`. Declare `macros = "…"` on your class to add one of your own; it is
  searched before these.
- `components/templates/rows.html` — `row`, `expandable_row`, `card_open`, and
  `write_controls`, which builds the cog and its contents from `actions:` and
  `setpoint:` so a component never has to know how `@post` works.
- `components/templates/controls.html` — the buttons, the cog, the setpoint
  field and the drop-down, if you need an arrangement of your own.
