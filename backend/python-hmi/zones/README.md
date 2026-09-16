# zones — what each station shows

One folder per control-system zone. Each zone is a separate network and this app
is deployed once per zone, so the repository is laid out the way the facility is:

```
zones/
├── 01/                     a zone
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
