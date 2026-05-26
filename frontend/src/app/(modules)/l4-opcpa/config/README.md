# L4 OPCPA laser config (`lasers.yaml`)

`lasers.yaml` is the **frontend source of truth** for per-laser topology — how
many chillers, flashlamp boxes, modboxes, etc. each laser (NL1–NL5) has, and
which commands it exposes. **Edit the YAML, not the code.**

You do not need to know TypeScript. Open `lasers.yaml` in an editor with the
YAML extension (e.g. VS Code "YAML" by Red Hat); the `# yaml-language-server`
line at the top wires up **autocomplete and inline error checking** from
`lasers.schema.json`.

## How it works

- Each item under `lasers:` is one laser. **File order = panel order** (left to right).
- Every field is required and explicit — no hidden defaults.
- On `next build` (and during `next dev`) the file is parsed and validated. An
  invalid file **fails the build** with a readable message naming the laser and
  field. Changing the config in a deployed build therefore needs a rebuild.

## Fields

| Field | Type | Example | Effect |
|---|---|---|---|
| `id` | string | `NL1` | The `<LASER>` segment of every PV (`BI_NL1_CONN`, `AI_NL1_…`). |
| `mssCount` | int ≥ 0 | `6` | MSS sub-indicators `BI_<id>_MSS_1..N` counted in the General overview. |
| `modboxCount` | int ≥ 0 | `5` | Modbox indicators `BI_<id>_MODBOX_1..N`. **`0` hides the Modbox section.** |
| `channelsPerBox` | int ≥ 1 | `2` | Flashlamp channels per box `SI_<id>_FL_<box>_CH1..CHn`. Almost always 2. |
| `chillerIds` | string[] | `['11','12']` | One row each, reading `AI_<id>_CHILLER_<cid>_FLOW/TEMP/LEVEL`. **`[]` hides the Chillers section.** |
| `flashlampBoxes` | string[] | `['22','23']` | Flashlamp box ids. **`[]` hides the Flashlamps section.** |
| `delayPresets` | int[] | `[50,500]` | Trigger-delay preset buttons (ns). |
| `moduleErrors` | string[] | see below | Error indicators `BI_<id>_ERR_<name>`. |
| `commands` | enum[] | see below | Which command buttons appear. |

### `moduleErrors`

List every module-error indicator explicitly, e.g.
`['REGEN', 'CHILLER_11', 'CHILLER_12', 'CHILLER_13', 'CHILLER_14', 'FLASHLAMPS']`.

**Rule (enforced at build):** the `CHILLER_<id>` entries must match `chillerIds`
exactly. If you add a chiller to `chillerIds`, add its `CHILLER_<id>` here too —
otherwise the build fails with a "do not match" error. This keeps the chiller
rows and their error indicators in sync.

### `commands`

The allowed values are the closed vocabulary (also wired to backend sequences
and UI buttons):

```
START_LASER, STOP_LASER, ALIGNMENT_MODE, SYSTEM_STANDBY,
FLASHLAMPS_RUN, FLASHLAMPS_STANDBY, MODBOX_ON, MODBOX_OFF,
SET_DELAY, LOAD_WAVEFORM
```

A laser only shows buttons for the commands it lists — omit one and its button
is hidden for that laser. Adding a **brand-new** command (not in the list above)
needs code changes (the `LASER_COMMANDS` tuple in `../lib/pv-names.ts`, the Go
backend `sequences` map, and a button in the relevant section) — the YAML can
only choose among existing commands.

## Empty banks hide sections

`chillerIds: []`, `flashlampBoxes: []` or `modboxCount: 0` hide the whole
Chillers / Flashlamps / Modbox section for that laser (the laser simply doesn't
have that subsystem). General and Regen always render.

## `lasers.schema.json`

Generated from the zod schema in `schema.ts`. **Do not hand-edit it.** After
changing `schema.ts`, regenerate:

```bash
npm run gen:schema
```

A test (`schema.drift.test.ts`) fails if the committed file is stale.

## Mock backend caveat (test-only)

`backend/mockup-websocket-server/l4_opcpa.go` is a development/test mock with its
own hardcoded constants. **It does not read this YAML.** If you add devices here
(a new chiller id, flashlamp box, or extra channel) the mock won't seed those
PVs and they render as `<>` (unknown) until a real EPICS gateway provides them —
or until someone hand-mirrors the change in the Go file. Validation passing does
**not** mean the mock has matching data.
