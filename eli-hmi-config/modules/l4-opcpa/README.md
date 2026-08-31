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

You do not need to know TypeScript, and there is no editor setup to do. The
field reference below is the format's documentation; the config validator
(see [../README.md](../README.md)) is what checks your edits.

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
| `pvs.regenState` | PV name | Regen status string. |
| `pvs.regenTemp` | PV name | Regen temperature readout. |
| `pvs.phd2Mean` | PV name | Second PHD mean readout. |
| `pvs.attenuator` | PV name | Attenuator value (read + direct write). |
| `pvs.loadedWaveform` | PV name | Current waveform preset. |
| `pvs.latestWaveform` | PV name | Previous waveform moved into Waveform Latest when a new preset is applied. Optional. |
| `triggerDelay` | PV name[] | Trigger-delay readouts; all should read equal (mismatch is flagged). |
| `mss` | `{label, pv}`[] | MSS sub-indicators counted in the Overview: `label` shown in UI, `pv` is the indicator PV. |
| `moduleErrors` | `{label, pv}`[] | Error indicators: `label` shown in UI, `pv` is the indicator PV. |
| `chillers` | `{label, flow, temp, level}`[] | One row each; `label` shown, three readout PVs. **`[]` hides the Chillers section.** |
| `flashlamps` | `{label, pv}`[] | One channel each; `label` shown, `pv` is the state PV. **`[]` hides the Flashlamps section.** |
| `modbox` | `{label, pv}`[] | Modbox state indicators: `label` shown in UI, `pv` is the indicator PV. **`[]` hides the Modbox section.** |
| `delayPresets` | int[] | Trigger-delay preset buttons (ns). |
| `commands` | map `SYMBOL: PV` | Which command buttons appear and which PV each writes (see below). |

A "PV name" is any non-empty string — put the exact name the gateway exposes.

### Example (one chiller, one flashlamp channel)

```yaml
chillers:
  - { label: 'PS1225:11', flow: AI_NL2_CHILLER_11_FLOW, temp: AI_NL2_CHILLER_11_TEMP, level: AI_NL2_CHILLER_11_LEVEL }
flashlamps:
  - { label: '22 Ch1', pv: SI_NL2_FL_22_CH1 }
```

### `commands`

A map from a command symbol to **the PV the button's write goes to**:

```yaml
commands:
  START_LASER: START_LASER                                # placeholder — no real PV yet
  ALIGNMENT_MODE: L4-OPCPA-NL2:SetAlignmentMode           # real PV — written directly
  SET_DELAY: L4-OPCPA-NL2:PS5059:22:SetBothChannelsTrigDelay
```

The allowed keys are the closed vocabulary (wired to UI buttons):

```
START_LASER, STOP_LASER, ALIGNMENT_MODE, SYSTEM_STANDBY,
FLASHLAMPS_RUN, FLASHLAMPS_STANDBY, MODBOX_ON, MODBOX_OFF,
SET_DELAY, LOAD_WAVEFORM
```

Rules:

- A laser only shows buttons for the keys it lists — omit a key and its button
  is hidden for that laser. Key order doesn't matter.
- **Real PV**: the frontend writes to that exact name. The value written is
  fixed per command (`1` as the trigger for action buttons, the delay in ns for
  `SET_DELAY`, the waveform name for `LOAD_WAVEFORM`).
- **Placeholder** (value identical to the key, e.g. `START_LASER: START_LASER`):
  means "controls haven't delivered this PV yet". The frontend falls back to the
  mock-backend sequence trigger `CMD_<id>_<SYMBOL>` built in code (app repo's
  `l4-opcpa/lib/pv-names.ts`). Replace the value with the real PV when it
  exists — no code change.
- Anything else (a value that is neither the key nor contains `:`) is rejected
  by validation as a likely typo.

Adding a **brand-new** command still needs code changes in the app repo (the
`LASER_COMMANDS` tuple + a button, and a mock `sequences` entry for the
placeholder path).

## Empty banks hide sections

`chillers: []`, `flashlamps: []` or `modbox: []` hide the whole Chillers /
Flashlamps / Modbox section for that laser (it simply doesn't have that
subsystem). General and Regen always render.

## Validation

The authoritative rules live in the app's zod schema
(`l4-opcpa/config/schema.ts`) and run in three places: at container startup, in
this repo's CI, and in the config validator you can run by hand — see
[../README.md](../README.md). Beyond field types they enforce what no schema
could express, such as rejecting duplicate PV names across lasers.

## Mock backend caveat (test-only)

`backend/mockup-websocket-server/l4_opcpa.go` is a development/test mock with its
own hardcoded constants. **It does not read this YAML.** If you change a PV name
here to something the mock doesn't seed, it renders as `<>` (unknown) until a
real EPICS gateway provides it. Validation passing does **not** mean the mock has
matching data.
