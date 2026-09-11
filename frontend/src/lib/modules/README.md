# Module configs

> Architecture context: [`docs/frontend/module-pages.md`](../../../../docs/frontend/module-pages.md). End-to-end recipe: [`docs/workflows/adding-a-control-page.md`](../../../../docs/workflows/adding-a-control-page.md).

P3, L3BT, and L4fBT share a `ModuleConfig` data shape that drives
`<ModuleControlPage>`. The app owns the schema and loading code in this
directory; the editable data lives in the runtime config directory under
`modules/<module>/config.yaml`.

## Files and ownership

- `module-config-schema.ts` — strict Zod schema, YAML parser, and inferred
  types. The YAML file *is* the `ModuleConfig` shape; there is no
  `schemaVersion`, because config and schema now ship in the same commit.
- `types.ts` — compatibility type exports for components.
- `module-config-loader.ts` — resolves the file for the current zone, parses it,
  deeply freezes it, and caches successful production reads.
- `src/app/(modules)/{p3,l3bt,l4fbt}-controls/config/zones/<ZONE_CODE>.yaml` —
  the data, one file per zone. The path comes from the `MODULES` registry, so
  there is no reference to resolve; there is also **no fallback** if a zone's
  file is missing, because a station silently running on another station's PV
  names is worse than a failed build.
- This file is the format's prose field reference — keep it in step with the
  schema; it is the only documentation the controls team has.

The small route `page.tsx` files are server entries. They call
`loadModuleConfig(key)` and pass the result to a colocated `'use client'` view,
which composes `<ModuleControlPage>` with the module's bespoke `bottomRow`.

## Adding a new module

1. Add the module to `MODULES` in `src/lib/settings/zone-schema.ts` (route +
   config directory), to `moduleConfigKeyMap` in `module-config-loader.ts`, and
   to the exhaustive parser registry in
   `src/lib/settings/module-config-validation.ts`. The `satisfies` constraints
   make a missing entry a compile error.
2. Add `config/zones/<ZONE_CODE>.yaml` under
   `src/app/(modules)/<module>-controls/`, one per zone that will enable it:

   ```yaml
   heading: My Module
   # interlocks, safetyPermission, cleanDryAir, backing, roughing …
   ```

   Copy an existing module's file for the complete shape — the schema is strict,
   so unknown keys are rejected rather than ignored.

3. Add bespoke parts under
   `src/app/(modules)/<module>-controls/parts/`. Their PV-to-component wiring
   stays React code because it is structural.
4. Add a dynamic server page and explicit client view following one of the
   existing three routes.
5. List the module in `config/global.yaml` for every zone that should expose
   the page — with `text` if it belongs in the menu, without if it should be
   reachable but hidden. A zone that does not list it still gets its file
   validated on every build, so turning it on later cannot be the first time
   that data is checked.
6. Run `npm run validate:config` (also wired as `prebuild`) plus the normal
   test/build gates.

## What goes in YAML vs. `parts/`?

| Lives in `ModuleConfig` YAML                          | Lives in `parts/` TSX                          |
| ----------------------------------------------------- | ---------------------------------------------- |
| Interlocks (PV name + title pairs)                    | Volumes with mixed `VolumePanel.*` children    |
| Safety permissions                                    | Connectors, gates, and cross-module hyperlinks |
| Backing, roughing, and clean-dry-air sensor/pump data | Any non-uniform structural composition         |

The split is deliberate: the shared panels have data-only variance, while the
bottom rows differ as component trees. Do not turn JSX into a YAML component
language.

## Key names are not consistent — read this first

The YAML mirrors an older TypeScript shape, and that shape spelled the same
concept differently in different places. These are the easiest mistakes to make,
and the validator is the only thing that catches them:

| Context | Correct key | **Not** |
|---|---|---|
| Interlock / safety-permission items | `pvname` | ~~`pvName`~~ |
| Sensor entries (`sensorPVs`, `pressure`, `flow`) | `pvName` | ~~`pvname`~~ |
| Locking | `pvName` | ~~`pvname`~~ |
| Pump speed | `rpmPV` | ~~`rpmPv`~~ |
| Pump valve | `valvePv` | ~~`valvePV`~~ |

Unknown keys are rejected outright rather than ignored, so a typo fails the
build instead of silently dropping a signal. `npm run validate:config` names the
file and the exact path inside it:

```
✗ p3 (src/app/(modules)/p3-controls/config/zones/test.yaml): … is invalid:
✖ Unrecognized key: "pvName"
  → at interlocks.items[0]
✖ Invalid input: expected string, received undefined
  → at interlocks.items[0].pvname
```

## Field reference

Every top-level field is **required**; all three existing files set all of them.
Every string is trimmed and must be non-empty.

| Field | Type | What it is |
|---|---|---|
| `heading` | text | Heading rendered in the page's top section. |
| `interlocks` | interlock group | Interlock indicator panel. |
| `safetyPermission` | interlock group | Machine-safety-permission panel; same shape as `interlocks`. |
| `cleanDryAir` | CDA block | Clean-dry-air section. |
| `backing` | backing block | Backing pump + sensor section. |
| `roughing` | roughing block | Roughing pump + sensor section. |

There is no `schemaVersion`: config and schema ship in the same commit, so they
cannot disagree. A leftover one is rejected as an unknown key.

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
| `options` | no | number or object | Numeric formatting — see [Number formatting](#number-formatting). |

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

## Number formatting

Every sensor entry takes an optional `options:` deciding how its reading is
rendered. It uses the **same definition** as L4 OPCPA's `format:` block
(`src/lib/utils/value-format-schema.ts`), so both config formats accept the same
values and `getFormattedValue` is the only thing that renders numbers:

```yaml
pressure:
  pvName: E3-P3-PPS801:CDA_PRESSURE
  label: PPS801
  options: 2                                  # 2 decimal places
flow:
  pvName: E3-P3-PPS801:FLOW
  label: PPFS801
  options: { format: precision, toPrecision: 3 }
```

| Written as | Shows `23.456` as |
| --- | --- |
| `2` | `23.46` (decimal places — the usual case) |
| `{ format: fixed, toFixed: 2 }` | `23.46` |
| `{ format: precision, toPrecision: 2 }` | `23` (significant digits) |
| `{ format: exponential, toExponential: 2 }` | `2.35e+1` |
| `{ format: raw }` | `23.456` |

Omitted, a reading renders the way it always has.

## PV names

Store logical PV names. `useWebSocketData` applies the development prefix
internally; the production backend receives the raw names.

### Deliberate placeholders

The migration preserves every legacy placeholder, duplicate, and TODO comment
instead of inventing control-system names. Examples in the YAML include
`undefined1:PRESSURE`, `AI_RPM_SPEED_P000`, and P3 entries that intentionally
reuse the EGV501 PV for the SGV503 label.

The bespoke bottom-row files were intentionally out of migration scope, so
their existing placeholders (for example `SI_???` and `AI_RPM_SPEED_P04`) also
remain in TSX. Replace any placeholder only after controls confirms the
canonical PV.

Useful searches from the repository root:

```bash
grep -RIn 'TODO\|undefined[0-9]' frontend/src/app/'(modules)'/{p3,l3bt,l4fbt}-controls/config
grep -RIn 'TODO\|SI_???\|AI_RPM_SPEED_P04' frontend/src/app/'(modules)'/{p3,l3bt,l4fbt}-controls/parts
```
