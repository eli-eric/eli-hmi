# LaserPanel Component

> Architecture context: [`docs/frontend/hmi-components.md`](../../../../../docs/frontend/hmi-components.md). The compound-component pattern is recorded in [ADR-0003](../../../../../docs/adr/0003-compound-components-for-hmi-panels.md).

Compound component for a single laser column on the `/l4-opcpa` page. Mirrors
the `VolumePanel` idiom (compound parent + static-property section
subcomponents) but adapted to the laser-control domain: each laser column has
a stack of five sections (General, Regen, Chillers, Flashlamps, Modbox)
rather than the vacuum-system layout.

## Usage

```tsx
import { LaserPanel } from '@/components/hmi/laser-panel'

<LaserPanel title="NL2">
  <LaserPanel.General laser="NL2" connectionPv={...} fullPowerPv={...} shutterPv={...} phdMeanPv={...} mssPvs={[...]} moduleErrors={[{label, pv}]} commands={[...]} />
  <LaserPanel.Regen regenStatePv={...} regenTempPv={...} phd2MeanPv={...} attenuatorPv={...} />
  <LaserPanel.Chillers chillers={[{label, flow, temp, level}]} />
  <LaserPanel.Flashlamps laser="NL2" flashlamps={[{label, pv}]} triggerDelay={[...]} delayPresets={[...]} commands={[...]} />
  <LaserPanel.Modbox laser="NL2" modbox={[...]} loadedWaveformPv={...} commands={[...]} />
</LaserPanel>
```

Sections receive **full PV-name strings** as props (resolved from
the current zone's `modules.l4-opcpa.config` file); `laser` is passed only where command PVs are needed.

Engineer-author UX: each laser's wiring is one declarative tree in
`src/app/(modules)/l4-opcpa/components/laser-panel-instance.tsx`, fed by the
per-laser specs loaded at runtime from the directory selected by `CONFIG_DIR`
(template: `eli-hmi-config/modules/l4-opcpa/lasers.yaml`; see
[ADR-0011](../../../../../docs/adr/0011-runtime-zone-config.md)). Sections
whose device bank is empty are omitted; `commands` (per laser) gates which
action buttons render.

## Files

| File | Role |
|---|---|
| `LaserPanel.tsx` | Compound shell — header + body, attaches `.General` etc. as static props. |
| `GeneralSection.tsx` | Overview row (CONN/FULLP/MSS/ERR), shutter, PHD, Start/Stop/Alignment/Standby. |
| `RegenSection.tsx` | Regen state, temp, PHD2, attenuator (with `PresetIntegerInput`). |
| `ChillersSection.tsx` | 4×3 grid of chiller flow/temp/water readouts. |
| `FlashlampsSection.tsx` | 14-channel SB/RUN/STOP/FAIL counts + trigger delay (with mismatch detection). |
| `ModboxSection.tsx` | Merged modbox state + waveform select. |
| `OverviewBar.tsx` | Header cluster (CONN, FULLP, MSS, ERR) shown at the top of `GeneralSection`. |
| `WaveformSelect.tsx` | Dropdown + Load button for `CMD_<L>_LOAD_WAVEFORM` (catalog cached). |

## Patterns

### PV naming

Signal PV names are full strings in the zone-referenced mounted YAML, passed into these
sections as props — never assembled here. Only the command PV is built in code,
via `pv.cmd` in `src/app/(modules)/l4-opcpa/lib/pv-names.ts`. The test-only mock
backend (`backend/mockup-websocket-server/l4_opcpa.go`) seeds the names
currently in the YAML.

### Single write entry point

All write actions go through `pvWrite()` from `src/lib/api/pvs.ts` →
`POST /pv/:name`. Command-PV indirection (`CMD_<L>_<NAME>`) dispatches to
coordinated effect chains on the backend. Direct PVs (e.g. `BI_<L>_SHUTTER`)
are written straight through.

### `usePvWrite` hook

Every write control (`ActionButton`, `PresetIntegerInput`, `WaveformSelect`)
consumes the shared `usePvWrite()` hook from
`@/components/hmi/controls/usePvWrite` for the idle/pending/success/error
lifecycle and `CogToggle` auto-close.

### Readouts (`Values.tsx`)

Single-PV displays (`FloatValue`, `IntegerValue`, `StringValue`, `BoolPill`)
deliberately use a minimal `<>` placeholder for the loading / disconnected /
unknown states rather than wrapping in `PVDisplay`. Rationale: the L4
operator wireframe specifies tight grid layouts where a full
`PVDisplay`-style error UI (icon + message) would break the visual rhythm.
The `<>` glyph (in `--color-gray-800`) is the operator-facing convention
for "no data yet". Connection-lost feedback is centralised in a single
banner on `/l4-opcpa/page.tsx`.
