# HMI components

Reusable compound components under `frontend/src/components/hmi/`. The compound-component pattern is intentional: a parent attaches subcomponents as static properties (`VolumePanel.SensorBar`, `LaserPanel.Regen`) so engineers compose pages **declaratively** without managing React state. See [ADR-0003](../adr/0003-compound-components-for-hmi-panels.md).

## Inventory

| Component | Subcomponents | Domain | Canonical README |
| --- | --- | --- | --- |
| `VolumePanel` | `.SensorBar` `.Pump` `.TurbopumpBasic` `.Locking` `.Doors` `.Config` `.MasterKey` `.Interlocks` `.MultiVolumes` `.Container` `.WarningErrorControl` | Vacuum systems | [README](../../frontend/src/components/hmi/volume-panel/README.md) |
| `ConnectorLine` | `.Line` `.Valve` `.Gate` `.GateConnected` `.LabelValue` `.ValveStatus` `.ValveControlStatus` | Vacuum systems | [README](../../frontend/src/components/hmi/connector-line/README.md) |
| `LaserPanel` | `.General` `.Regen` `.Chillers` `.Flashlamps` `.Modbox` | Laser control (L4 OPCPA) | [README](../../frontend/src/components/hmi/laser-panel/README.md) |
| `controls/` | `SectionCard` `DataRow` `DetailList` `usePvWrite` `ActionButton` `PresetIntegerInput` `CogToggle` `Values.{Float,Integer,String,BoolPill}` `WaveformSelect` | Reusable primitives (write controls + readouts) | [README](../../frontend/src/components/hmi/controls/README.md) |
| `status-bar/` | (kebab-case directory; uniform-case carve-out applies — see [AGENTS](../../frontend/AGENTS.md)) | Connection status banner | — |

## When to use which

- **Vacuum/pump page** → start from `<VolumePanel>` + `<ConnectorLine>`, drive top panels from a `ModuleConfig` ([module pages](module-pages.md)).
- **Laser control page** → `<LaserPanel>` + the `controls/` primitives. The L4 OPCPA page is the only consumer today; see [l4-opcpa](l4-opcpa.md).
- **New control surface** that fits neither (e.g. cryogenics) → consider whether you have **two real adapters** before introducing a new compound family. *One adapter means a hypothetical seam; two adapters means a real one.*

## Two flavours of readout

`VolumePanel` readouts go through `PVDisplay` (icon + message on error). `LaserPanel` + `controls/Values` use a minimal `<>` glyph instead — the L4 wireframe specifies tight grid layouts where a full error UI would break the rhythm. Connection-lost feedback is centralised in a banner on the L4 page. See [laser-panel/README.md](../../frontend/src/components/hmi/laser-panel/README.md#readouts-valuestsx).

## Write controls

All write controls (`ActionButton`, `PresetIntegerInput`, `WaveformSelect`) share one lifecycle via `usePvWrite()` (`components/hmi/controls/usePvWrite.ts`) — idle/pending/success/error plus `CogToggle` auto-close on success. The hook is the deep module behind the buttons. See [controls/README.md](../../frontend/src/components/hmi/controls/README.md#write-controls).

## Filename casing

PascalCase for files whose export is a single React component (`VolumePanel.tsx`, `ActionButton.tsx`) is permitted in the `components/hmi/{controls,laser-panel,volume-panel,connector-line}/` subtrees. `status-bar/` uses kebab-case. **Don't mix within a directory.** See [AGENTS](../../frontend/AGENTS.md) and commit `e9965be`.
