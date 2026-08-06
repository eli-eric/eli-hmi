# L4 OPCPA laser config (`lasers.yaml`)

`lasers.yaml` is the **frontend source of truth** for the L4 OPCPA page. For
every laser (NL1–NL5) it holds the **full PV name of each signal** — exactly the
string the controls team / EPICS gateway provides. The frontend reads these
verbatim; it does **not** assemble names from prefixes. **Edit the YAML, not the
code.**

> The names currently in the file are the mock-backend convention
> (`BI_NL2_CONN`, `AI_NL2_CHILLER_11_FLOW`, …). When controls deliver the real
> EPICS names (e.g. `SY3PL50M:32`), just **replace the strings** here — no code
> change.

You do not need to know TypeScript. Open `lasers.yaml` in an editor with the
YAML extension (e.g. VS Code "YAML" by Red Hat); the `# yaml-language-server`
line at the top wires up **autocomplete and inline error checking** from
`../../schemas/l4-opcpa-lasers.schema.json`.

## How it works

- Each item under `lasers:` is one laser. **File order = panel order** (left to right).
- Every field is required and explicit — no hidden defaults.
- The file is loaded **at runtime** from the mounted config directory: the
  zone file (`zones/<ZONE_CODE>.yaml`) points at it via `modules.l4-opcpa.config`.
  It is parsed + validated at container start (a broken file stops the
  container with a readable message) and cached — **restart the container to
  pick up changes**; no application rebuild is needed.

## Fields

| Field | Type | What it is |
|---|---|---|
| `id` | string | Laser id, e.g. `NL2`. Panel title; also the `<LASER>` in command PVs. |
| `pvs.connection` | PV name | Connection bool (Overview CONN). |
| `pvs.fullPower` | PV name | At-full-power bool (Overview FULLP). |
| `pvs.shutter` | PV name | Shutter position bool (read + direct write). |
| `pvs.phdMean` | PV name | PHD mean intensity readout. |
| `pvs.regenState` | PV name | Regen on/off bool. |
| `pvs.regenTemp` | PV name | Regen temperature readout. |
| `pvs.phd2Mean` | PV name | Second PHD mean readout. |
| `pvs.attenuator` | PV name | Attenuator value (read + direct write). |
| `pvs.loadedWaveform` | PV name | Current waveform preset. |
| `pvs.latestWaveform` | PV name | Previous waveform moved into Waveform Latest when a new preset is applied. Optional. |
| `triggerDelay` | PV name[] | Trigger-delay readouts; all should read equal (mismatch is flagged). |
| `mss` | PV name[] | MSS sub-indicators counted in the Overview. |
| `moduleErrors` | `{label, pv}`[] | Error indicators: `label` shown in UI, `pv` is the indicator PV. |
| `chillers` | `{label, flow, temp, level}`[] | One row each; `label` shown, three readout PVs. **`[]` hides the Chillers section.** |
| `flashlamps` | `{label, pv}`[] | One channel each; `label` shown, `pv` is the state PV. **`[]` hides the Flashlamps section.** |
| `modbox` | PV name[] | Modbox state PVs. **`[]` hides the Modbox section.** |
| `delayPresets` | int[] | Trigger-delay preset buttons (ns). |
| `commands` | enum[] | Which command buttons appear (see below). |

A "PV name" is any non-empty string — put the exact name the gateway exposes.

### Example (one chiller, one flashlamp channel)

```yaml
chillers:
  - { label: 'PS1225:11', flow: AI_NL2_CHILLER_11_FLOW, temp: AI_NL2_CHILLER_11_TEMP, level: AI_NL2_CHILLER_11_LEVEL }
flashlamps:
  - { label: '22 Ch1', pv: SI_NL2_FL_22_CH1 }
```

### `commands`

The allowed values are the closed vocabulary (wired to backend sequences and UI buttons):

```
START_LASER, STOP_LASER, ALIGNMENT_MODE, SYSTEM_STANDBY,
FLASHLAMPS_RUN, FLASHLAMPS_STANDBY, MODBOX_ON, MODBOX_OFF,
SET_DELAY, LOAD_WAVEFORM
```

A laser only shows buttons for the commands it lists — omit one and its button
is hidden for that laser. Commands are **not** plain PVs: each triggers a
coordinated backend sequence of writes (the wire name `CMD_<id>_<NAME>` is built
in code, in the app repo's `l4-opcpa/lib/pv-names.ts`). Adding a **brand-new**
command needs code changes in the app repo (the `LASER_COMMANDS` tuple + the Go
backend `sequences` map + a button).

## Empty banks hide sections

`chillers: []`, `flashlamps: []` or `modbox: []` hide the whole Chillers /
Flashlamps / Modbox section for that laser (it simply doesn't have that
subsystem). General and Regen always render.

## `../../schemas/l4-opcpa-lasers.schema.json`

Generated from the zod schema in the app repo (`l4-opcpa/config/schema.ts`,
`npm run gen:schema`). **Do not hand-edit it.** It only powers editor
autocomplete/validation here; the authoritative validation runs in the app at
startup and in CI via the app repo's `npm run validate:config`.

## Mock backend caveat (test-only)

`backend/mockup-websocket-server/l4_opcpa.go` is a development/test mock with its
own hardcoded constants. **It does not read this YAML.** If you change a PV name
here to something the mock doesn't seed, it renders as `<>` (unknown) until a
real EPICS gateway provides it. Validation passing does **not** mean the mock has
matching data.
