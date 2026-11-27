# zones — what each station shows

One folder per control-system zone. Each zone is a separate network and this app
is deployed once per zone, so the repository is laid out the way the facility is:

```
zones/
├── 04/                     a zone
│   ├── zone.yaml           which hostnames are this zone
│   ├── l4-opcpa/gui.yaml   a screen  ->  /l4-opcpa  ->  a menu entry
│   └── motors/gui.yaml     another   ->  /motors
├── TESTZ/                  the development zone
└── TESTZ-IOC/              generated; see ioc/README.md
```

**A folder is a screen.** Adding a screen to a zone is creating a folder with a
`gui.yaml` in it; removing one is deleting the folder. There is no registry to
edit and no route to declare, and the main menu *is* the folder listing — so the
menu cannot disagree with what the app serves.

The folder name is the URL, so a few names are taken by paths the app serves
itself: `api`, `health`, `login`, `logout`, `monitor`, `static` and `stats`. A
screen folder with one of those names stops the start with an error saying so,
rather than giving a menu entry that can never open.

## Adding a screen

```bash
mkdir zones/01/chillers
cp zones/TESTZ/chillers/gui.yaml zones/01/chillers/     # start from a real one
$EDITOR zones/01/chillers/gui.yaml                      # change the PV names
make run ZONE_CODE=01                                   # it is in the menu
```

A `gui.yaml` is a title, a menu position, and a list of components:

```yaml
title: Chillers          # menu label and page heading
order: 20                # lower comes first
description: Cooling plant for the L4 OPCPA lasers.

components:
  - component: panel
    title: Chiller bank
    components:
      - component: value
        label: Supply pressure
        pv: L4-CHW:SupplyPressure
        units: bar
        format: 2
        range: [3.0, 5.0]
        alarm: { low: 3.2, lolo: 3.0 }
```

The components are in [`../components/`](../components/README.md), each with its
own README section and every setting documented. A wrong key fails at start-up
naming the keys that would have worked:

```
gui.yaml#0.1: component 'value' is misconfigured:
  labl: Extra inputs are not permitted
  keys 'value' accepts: actions, alarm, component, demo, format, good, id,
  kind, label, off_text, on_text, pv, range, setpoint, states, title, units, values
```

### `macros:` when a component's names share a start

```yaml
- component: laser-panel
  id: NL2
  macros: {P: L4-OPCPA-NL2}
  pvs:
    fullPower: $(P):FullPower                       # L4-OPCPA-NL2:FullPower
  mss:
  - {label: PSS permission, pv: L4-PSS:NP2_PERMISSION_TO_OPERATE_CH1}
```

`$(NAME)` is replaced by that macro in every string of the block, however deep:
PVs, command targets, labels. A name without a macro is a full name, so a PV that
lives elsewhere, like the MSS above, needs nothing to say so. The spelling is
EPICS's own.

- A component's macros are its own. Components nested under it do not inherit
  them, so each block can be read without looking anywhere else.
- A `$(NAME)` the block does not define, or a `$(` that is not a reference,
  stops the zone loading and names the block.
- A macro is text. Quote one that YAML would read as something else
  (`N: "22"`, `T: "1:30"`).

A laser's `P` is more than shorthand. Its modules' registers are named
`$(P):<label>:<name>`. With `modbox: true`, the whole Modbox section and the
ModBox register view are named `$(P):ModBox:<suffix>`, because every ModBox is
the same device. A laser with modules or a ModBox must define `P`. A non-volatile write, for the registers declaring
`nv: true`, is armed at `$(P):UseNVMemory`.

### `selectable:` when a workstation shows only some of it

```yaml
title: OPCPA
selectable: true         # one checkbox per top-level component, in the header
```

Each top-level component gets a checkbox beside the title, labelled with its
id. Unticking one hides it at once, closes its open Registers or ModBox view,
and reopens the screen's stream without it: a hidden component is neither
subscribed to nor patched. The choice is this workstation's, kept in a cookie
the server reads when it renders, so a hidden component is hidden from the
first frame. What is kept is what was *hidden*, so a component added to the
screen later shows up on workstations that chose before it existed.

Hiding a component also gives up this tab's exclusive control of it at once,
and ticking it back takes control of whatever is free — never from another
tab that holds it. Opening the screen takes every free control on the
components it shows, and none on the hidden ones.

### Splitting a big screen

`gui.yaml` holds the screen's settings. Any *other* `*.yaml` in the folder is
read for its `components:` as well, in filename order — so one file per device
keeps a twenty-motor screen reviewable, and adding a device is adding a file.
An extra file may also have its own `anchors:` (see the end of this page), and
nothing else.

### `wide:` when a value does not fit

A reading gets a fixed field, so a column of them lines up and a one-word state
does not become a box the width of the panel. A string that needs more than that
— a recipe name, a long state — asks for it:

```yaml
- { component: value, label: Recipe, pv: "…:Recipe:Name", wide: true }
```

It is deliberately the exception: every row that takes it costs the alignment
that makes a card scannable.

### `range:` and `alarm:` are worth filling in

They are engineering information, not decoration:

- `range:` is the engineering range. It becomes `LOPR`/`HOPR` on the local IOC's
  record, and it is the band a simulated reading drifts inside — a temperature
  with no range wanders between 0 and 100.
- `alarm:` becomes the record's real limit fields. A MINOR or MAJOR on the
  screen is then a genuine EPICS alarm that crossed a genuine limit, arriving
  through the same path as one from the hall.

`demo:` affects only the simulator and the local IOC. Setting it on one or two
signals per screen is worth doing: a screen where nothing is ever alarmed never
shows an engineer what an alarm looks like, and `demo: { undefined: true }` is
the only way to see `PV INV` on demand — the state an operator most needs to
recognise.

### Control: one desk at a time

Everything a component writes is under control by default: only the browser
tab that has control of the component may use it. Everyone else sees it
read-only, with who has it, from where and since when, and may **Force** it
after confirming. The first tab to open a screen gets every component on it
that nobody holds.

Control is per component — a device. A laser is controlled whole: every
button, and every register setpoint in its Registers view. A valve or a motor
is controlled whole. A `panel` is not a unit; each component in it is.

```yaml
- component: valve                    # under control: nothing to write
  label: VV1 gate valve
  pv: L4-VCS-NL2:VV1:State
  open_pv: L4-VCS-NL2:VV1:Open
  close_pv: L4-VCS-NL2:VV1:Close

- component: valve                    # any desk may press it
  label: VV2 roughing valve
  pv: L4-VCS-NL2:VV2:State
  exclusive: false
```

- **`exclusive: false` is per component.** There is no way to leave one button
  of a laser outside its control from a screen.
- **The lock is on the PV.** If two screens' components write the same PV,
  they are taken as one, and the station logs a warning naming both. Control
  is meant to be separated by device, so this is usually a slip.
- **Old forms still load.** A list (`exclusive: [START_LASER]`) is read as the
  whole component, and a per-button or per-setpoint `exclusive:` is ignored;
  both log a warning saying so.
- **A Stop is controlled with everything else.** A laser's Stop needs control
  like its Start. A component whose controls must stay pressable from any desk
  needs `exclusive: false`.

## Which zone am I?

`ZONE_CODE` wins when it is set. Otherwise the machine's hostname is matched
against every zone's `hostnames:` globs:

```yaml
# zones/01/zone.yaml
title: Zone 01 — L4 hall
hostnames:
  - "eli-hmi-z01*"
  - "*-z01-*"
```

Matching exactly one zone starts. Matching **none, or more than one, is a
start-up failure** — a control-room screen quietly showing another zone's PVs is
worse than one that did not start, because every value on it looks plausible.
The error says which zones exist and what to do.

The zone code is shown in the header of every screen, for the same reason.

`/stats` reports how the zone was chosen, which is the second question after
"is anything being monitored":

```json
{ "zone": "01", "zone_resolved_by": "hostname 'eli-hmi-z01-ws3'", … }
```

## YAML traps worth knowing

YAML 1.1 reads some bare words as booleans, and control systems are full of
them. `OFF`, `ON`, `YES`, `NO`, `Y`, `N`, `TRUE`, `FALSE` all need quoting when
they are *values*:

```yaml
states: ["OFF", COOLING, STANDBY, FAULT]     # not [OFF, COOLING, …]
```

The framework catches this one and says so rather than complaining about types.
The same applies to keys, which is why the `value` component spells its fields
`on_text:` and `off_text:` rather than `on:` and `off:`.

YAML anchors save repeating a block. Keep them under `anchors:`, which nothing
but YAML reads, rather than on the first component that uses them. An anchor
defined inside a component ties every later one to it, so deleting that
component breaks the rest:

```yaml
anchors:
  chiller: &chiller
    component: value
    units: degC
    format: 2
    range: [22, 26]
components:
  - <<: *chiller
    label: Chiller 11
    pv: L4-CHW-PS1225:11:T_out
  - <<: *chiller
    label: Chiller 12
    pv: L4-CHW-PS1225:12:T_out
```

An anchor reaches only the end of its own file. A second `---` document in the
same file doesn't help, because YAML starts every document with no anchors. An
extra file in a screen folder can therefore have an `anchors:` of its own.
