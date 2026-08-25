# Module configuration

Zone files reference module data by paths relative to the config-directory
root. A reference makes CI and production startup validate the file; it does
not expose the module's route.

- `l4-opcpa/lasers.yaml` uses the laser-specific format documented in that
  directory.
- `p3/config.yaml`, `l3bt/config.yaml`, and `l4fbt/config.yaml` share the
  vacuum-module format documented below.

The vacuum-module YAML contains only the data consumed by the shared
`ModuleControlPage`. Their bespoke volume/connector trees remain TSX in the
app because that wiring is structural.

## Checking your edits

There is no editor autocomplete for these files. Validate the whole directory
before deploying — this runs the app's real validation, the same code the
container executes at startup:

```bash
docker run --rm -v "$PWD:/config:ro" \
  lcs-harbor.lcs.local/lcs/eli-hmi-config-validator:<app-release-tag> --all
```

Use the tag of the app release you are deploying against. Errors name the file
and the exact path inside it, e.g.:

```
✗ p3: modules/p3/config.yaml is invalid:
✖ Unrecognized key: "pvName"
  → at interlocks.items[0]
✖ Invalid input: expected string, received undefined
  → at interlocks.items[0].pvname
```

## Watch out: the key names are not consistent

The YAML mirrors an older TypeScript shape, and that shape spelled the same
concept differently in different places. These are the easiest mistakes to
make and the validator is the only thing that catches them:

| Context | Correct key | **Not** |
|---|---|---|
| Interlock / safety-permission items | `pvname` | ~~`pvName`~~ |
| Sensor entries (`sensorPVs`, `pressure`, `flow`) | `pvName` | ~~`pvname`~~ |
| Locking | `pvName` | ~~`pvname`~~ |
| Pump speed | `rpmPV` | ~~`rpmPv`~~ |
| Pump valve | `valvePv` | ~~`valvePV`~~ |

Unknown keys are rejected outright rather than ignored, so a typo fails
validation instead of silently dropping a signal.

## File structure

Every top-level field is **required**; all three existing files set all of
them. Every string is trimmed and must be non-empty.

| Field | Type | What it is |
|---|---|---|
| `schemaVersion` | `1` | Format version the app understands. Must be exactly `1`. |
| `heading` | text | Heading rendered in the page's top section. |
| `interlocks` | interlock group | Interlock indicator panel. |
| `safetyPermission` | interlock group | Machine-safety-permission panel; same shape as `interlocks`. |
| `cleanDryAir` | CDA block | Clean-dry-air section. |
| `backing` | backing block | Backing pump + sensor section. |
| `roughing` | roughing block | Roughing pump + sensor section. |

### Interlock group (`interlocks`, `safetyPermission`)

| Field | Required | Type | What it is |
|---|---|---|---|
| `title` | yes | text | Panel title. |
| `items` | yes | list | Indicators, in display order. |
| `items[].pvname` | yes | PV name | Interlock PV. Note the lowercase `n`. |
| `items[].title` | yes | text | Indicator label. |
| `checkClearPv` | no | PV name | PV used to clear the whole group. |
| `width` | no | CSS size | Panel width, e.g. `320px`. |

### Sensor entry

Used by `sensorPVs` inside a sensor bar, and by CDA `pressure` / `flow`.

| Field | Required | Type | What it is |
|---|---|---|---|
| `pvName` | yes | PV name | Readout PV. Note the capital `N`. |
| `label` | yes | text | Displayed label. |
| `options` | no | object | Numeric formatting, see below. |
| `options.format` | yes¹ | `exponential` \| `precision` \| `raw` | Display format. |
| `options.toExponential` | no | number | Digits passed to `Number.toExponential`. |
| `options.toPrecision` | no | number | Precision passed to `Number.toPrecision`. |

¹ Required whenever `options` is present at all.

`toExponential` and `toPrecision` are not used by any current file — they are
available if a readout needs explicit precision.

### Sensor bar (`sensorBar`)

| Field | Required | Type | What it is |
|---|---|---|---|
| `title` | yes | text | Bar title. |
| `label` | yes | text | Bar label. |
| `sensorPVs` | yes | list | Sensor entries, in display order. |
| `height` | no | CSS size | Bar height. |

### Pump (`pump`)

All four fields are required.

| Field | Type | What it is |
|---|---|---|
| `title` | text | Pump title. |
| `rpmPV` | PV name | Pump speed readout. Capital `PV`. |
| `valvePv` | PV name | Associated valve PV. Lowercase `v`, capital `P`. |
| `valveLabel` | text | Valve label. |

### `backing`

| Field | Required | Type |
|---|---|---|
| `title` | yes | text |
| `sensorBar` | yes | sensor bar |
| `pump` | yes | pump |
| `width` | no | CSS size |
| `containerWidth` | no | CSS size |

### `roughing`

Same as `backing`, plus an optional interlock-style locking readout:

| Field | Required | Type |
|---|---|---|
| `title` | yes | text |
| `sensorBar` | yes | sensor bar |
| `pump` | yes | pump |
| `locking` | no | object with required `label` (text) and `pvName` (PV name) |
| `width` | no | CSS size |
| `containerWidth` | no | CSS size |

### `cleanDryAir`

| Field | Required | Type | What it is |
|---|---|---|---|
| `title` | yes | text | Section title. |
| `volumes` | yes | list | One entry per CDA volume, in display order. |
| `volumes[].title` | yes | text | Volume title. |
| `volumes[].pressure` | yes | sensor entry | Pressure readout. |
| `volumes[].flow` | yes | sensor entry | Flow readout. |
| `volumes[].width` | no | CSS size | Volume width. |
| `width` | no | CSS size | Section width. |

## Legacy placeholders

Some PV values and duplicate entries are explicitly marked as legacy
placeholders. They were preserved exactly during the TypeScript-to-YAML
migration; replace them only after controls confirms canonical names.
