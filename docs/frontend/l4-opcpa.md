# L4 OPCPA

The laser-control page. Lives at `frontend/src/app/(modules)/l4-opcpa/`. Source spec: [Confluence — Requirements: L4 OPCPA Control System](https://eli-eric.atlassian.net/wiki/spaces/CS/pages/2333902150).

## Why this page is special

Three things distinguish it from the other module pages:

1. **Custom shell, not `ModuleControlPage`.** The L4 wireframe is a flat 5-column grid of laser status panels — General / Regen / Chillers / Flashlamps / Modbox. The vacuum-system layout of `ModuleControlPage` doesn't fit; forcing it would mean stubbing out every panel. See [ADR-0007](../adr/0007-l4-custom-shell-not-modulecontrolpage.md).
2. **Per-laser topology in runtime YAML, not `ModuleConfig`.** The current zone points to a zod-validated, human-editable file (the template is `eli-hmi-config/modules/l4-opcpa/lasers.yaml`) describing each laser's *topology* (counts, IDs, presets, commands) independently. See [ADR-0010](../adr/0010-per-laser-yaml-config.md) and [ADR-0011](../adr/0011-runtime-zone-config.md).
3. **Full PV strings in config, not assembled names.** Each signal's complete PV name lives in that mounted YAML file; the frontend reads it verbatim. Only command PVs (`CMD_<id>_<NAME>`) are built in code. See [ADR-0010](../adr/0010-per-laser-yaml-config.md) (supersedes the read-PV registry of [ADR-0006](../adr/0006-pv-name-registry-l4-opcpa.md)).

## Layout

```
app/(modules)/l4-opcpa/
├── page.tsx                       # force-dynamic server shell: loads the zone's laser config
├── page.module.css
├── error.tsx                      # error boundary for runtime config failures
├── config/                        # zod schema + server-only mounted-config loader
├── lib/
│   ├── pv-names.ts                # PV-name registry
│   └── pv-names.test.ts
└── components/
    ├── laser-grid.tsx             # CSS grid wrapper
    ├── color-legend.tsx
    ├── l4-opcpa-view.tsx          # client view (banner + grid), takes specs prop
    └── laser-panel-instance.tsx   # renders one laser from a LaserSpec; hides empty-bank sections
```

`LaserPanel` and its sections live in `frontend/src/components/hmi/laser-panel/` (shared compound component, not L4-specific). Reusable primitives (`SectionCard`, `DataRow`, `DetailList`, `usePvWrite`, `ActionButton`, `PresetIntegerInput`, `CogToggle`, `WaveformSelect`, readouts) live in `frontend/src/components/hmi/controls/`.

## PV naming

Signal PV names are full strings in the zone-referenced `lasers.yaml` — read verbatim, never
assembled from prefixes. Only the command PV is built in code:

```ts
import { pv } from '@/app/(modules)/l4-opcpa/lib/pv-names'
pv.cmd('NL2', 'START_LASER') // 'CMD_NL2_START_LASER'
```

The mock backend (`backend/mockup-websocket-server/l4_opcpa.go`) is test-only and
seeds the names currently in the template YAML; it does not read the file. Swapping a
PV name to its real EPICS value is a pure config-repository edit and container restart.

## Write path

Every UI action is `POST /pv/<NAME>` with `{value: ...}`:

- **Command PVs** (`CMD_<L>_<NAME>`) — the backend dispatches a coordinated effect chain (e.g. `start_laser` writes 25+ PVs). The frontend treats the CMD PV as a fire-and-forget trigger.
- **Direct PVs** (`BI_<L>_SHUTTER`, `AI_<L>_ATT`) — straight write.

All controls share one lifecycle via `usePvWrite()` — see [hmi-components](hmi-components.md#write-controls).

## Topology source

The template at `eli-hmi-config/modules/l4-opcpa/lasers.yaml` mirrors NL2's topology across NL1, NL3, NL4, and NL5 because Confluence only documents NL2 and APL. When divergent topology is confirmed (chiller bank counts, flashlamp box IDs per laser), edit each laser's entry in the deployed config — every laser is configured independently.

`loadLaserSpecs()` resolves `modules.l4-opcpa.config` from `zones/<ZONE_CODE>.yaml`, reads it under `CONFIG_DIR`, validates it with `config/schema.ts`, and caches it for the production process lifetime. A container restart reloads production config; development reloads on the next request. The loader remains the seam for a future `GET /lasers` gateway endpoint. Runtime loading is recorded in [ADR-0011](../adr/0011-runtime-zone-config.md).

Unlike the p3/l3bt/l4fbt pages, L4 OPCPA uses a laser-specific runtime-YAML
schema rather than the shared `ModuleConfig` schema. The vacuum pages' bespoke
bottom-row parts remain TSX.

## Mock-backend behaviour

The mock seeds at-rest defaults for all 5 lasers on startup. Sequences hold their effect-PV writes for 3 s before releasing them back to auto-simulated drift around the last-set value. 10 % failure injection is off by default — enable it for demos:

```bash
curl http://localhost:8080/mode/fail-rate/10
```

Detail: [`frontend/src/app/(modules)/l4-opcpa/README.md`](../../frontend/src/app/(modules)/l4-opcpa/README.md).
