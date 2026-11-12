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

### Splitting a big screen

`gui.yaml` holds the screen's settings. Any *other* `*.yaml` in the folder is
read for its `components:` as well, in filename order — so one file per device
keeps a twenty-motor screen reviewable, and adding a device is adding a file.
See `zones/01/motors/`.

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

### `exclusive:` for a control only one desk may use

Mark a control `exclusive` and only the browser tab that has taken control of
it may write it. Everyone else sees it read-only, with who has it, from where
and since when, and may **Force** it after confirming.

```yaml
- component: value                    # per button, per setpoint
  label: Shutter
  pv: L4-…:Shutter:State
  kind: bool
  actions:
    - { label: Open,  value: 1, pv: "L4-…:Shutter:Open", exclusive: true }
    - { label: Close, value: 0, pv: "L4-…:Shutter:Close" }
  setpoint: { pv: "L4-…:Shutter:Set", exclusive: true }

- component: valve                    # true = both buttons, or name them
  label: VV1 gate valve
  pv: L4-VCS-NL2:VV1:State
  open_pv: L4-VCS-NL2:VV1:Open
  close_pv: L4-VCS-NL2:VV1:Close
  exclusive: true                     # or [open] / [close]

- component: motor
  exclusive: [move]                   # move, stop, or true for both

- component: laser-panel
  exclusive: [ALIGNMENT_MODE, SET_ATTENUATOR]   # command names, WAVEFORM_PRESET, or true
```

- **The lock is on the PV.** If one screen marks a PV exclusive, every control
  that writes it, on any screen of the zone, is locked too.
- **A name that isn't a control there stops the start-up** and lists the names
  that would work. For `laser-panel`, a command that isn't in `commands:`
  stops it as well, because a lock on a button nobody can see is a mistake.
- **Think twice before locking a Stop.** A stop that only another desk can
  press is a stop the operator in front of the device can't use without
  forcing control first.

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

YAML anchors save repeating a block:

```yaml
components:
  - &chiller
    component: value
    units: degC
    format: 2
    range: [22, 26]
    label: Chiller 11
    pv: L4-CHW-PS1225:11:T_out
  - <<: *chiller
    label: Chiller 12
    pv: L4-CHW-PS1225:12:T_out
```
