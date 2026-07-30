# L4 OPCPA Control System

> Architecture context: [`docs/frontend/l4-opcpa.md`](../../../../../docs/frontend/l4-opcpa.md). Related ADRs: [0006](../../../../../docs/adr/0006-pv-name-registry-l4-opcpa.md), [0007](../../../../../docs/adr/0007-l4-custom-shell-not-modulecontrolpage.md), [0010](../../../../../docs/adr/0010-per-laser-yaml-config.md) (supersedes [0008](../../../../../docs/adr/0008-laser-specs-location.md)), [0011](../../../../../docs/adr/0011-runtime-zone-config.md) (runtime zone config).

Operator UI for the L4 OPCPA laser system. Five lasers (NL1–NL5) rendered
side-by-side, each with five stacked sections (General, Regen, Chillers,
Flashlamps, Modbox).

**Source spec:** [Confluence — Requirements: L4 OPCPA Control System](https://eli-eric.atlassian.net/wiki/spaces/CS/pages/2333902150)

## Architecture

```
app/(modules)/l4-opcpa/
├── page.tsx                  # Server shell (force-dynamic) — loads the zone's laser config, renders L4OpcpaView
├── page.module.css
├── error.tsx                 # Error boundary for runtime config failures
├── config/                   # Schema + loader; the YAML itself lives in the zone-config dir (ADR-0011)
│   ├── schema.ts             # zod schema + LaserSpec type + parseLaserSpecs()
│   └── load-laser-specs.ts   # server-only loader: zone file → modules.l4-opcpa.config → parse
├── lib/
│   ├── pv-names.ts           # PV-name registry — canonical source for BI_/AI_/SI_/CMD_ names
│   └── pv-names.test.ts
└── components/
    ├── laser-grid.tsx        # CSS grid wrapper, 4 columns, wraps to 4+1
    ├── color-legend.tsx      # Wireframe colour legend at the top
    ├── l4-opcpa-view.tsx     # Client view (connection banner + grid), takes specs prop
    └── laser-panel-instance.tsx  # Renders one laser from a LaserSpec; hides empty-bank sections

components/hmi/
├── laser-panel/              # Compound LaserPanel + 5 section subcomponents (see its README)
└── controls/                 # Layout primitives + write controls + readouts (see its README)
```

## Why a custom page shell (not `ModuleControlPage`)

`ModuleControlPage` (used by `/p3-controls`, `/l3bt-controls`, `/l4fbt-controls`)
is opinionated around the vacuum-system layout: interlocks panel, safety
permission, clean-dry-air, backing, roughing, plus a configurable bottom row.

L4 OPCPA is a different domain — laser control, not vacuum. The wireframe
specifies a flat 5-column grid of laser status panels with no top/bottom
ribbons. Forcing it into `ModuleControlPage` would mean stubbing out all of
the vacuum-specific panels.

Per-laser **topology** (laser counts, chiller ids, delay presets, commands)
lives in a human-editable, zod-validated YAML in the **zone-config directory**
(`eli-hmi-config/modules/l4-opcpa/lasers.yaml` in-repo; a mounted config-repo
clone in deployments — see [ADR-0011](../../../../../docs/adr/0011-runtime-zone-config.md)),
not in `lib/modules/` (which is panel-layout `ModuleConfig` for
`ModuleControlPage`). Format docs: `eli-hmi-config/modules/l4-opcpa/README.md`.

`loadLaserSpecs()` resolves the current zone's file at request time (cached;
container restart = reload). It remains the seam for a future
`GET /lasers` gateway endpoint: swap the file read for a `fetch`.

## PV naming

Signal PV names are **full strings in the zone's `lasers.yaml`** (what controls
provides) — the frontend reads them verbatim; it does **not** assemble names
from prefixes. The only thing built in code is the **command PV**
(`CMD_<laser>_<NAME>`), because a command maps to a backend sequence of writes,
not a single PV:

```ts
import { pv } from '@/app/(modules)/l4-opcpa/lib/pv-names'
pv.cmd('NL2', 'START_LASER') // 'CMD_NL2_START_LASER'
```

The mock backend (`backend/mockup-websocket-server/l4_opcpa.go`) is test-only
and seeds the names currently in `lasers.yaml` (the mock convention). It does
**not** read the YAML — see `eli-hmi-config/modules/l4-opcpa/README.md`. See
[ADR-0010](../../../../../docs/adr/0010-per-laser-yaml-config.md).

## Write path

Every UI action is `POST /pv/<NAME>` with `{value: ...}`. Two flavours:

- **Command PVs** (`CMD_<L>_<NAME>`): the backend dispatches a coordinated
  effect chain (e.g. `start_laser` writes 25+ PVs). The frontend treats the
  CMD PV as a fire-and-forget trigger.
- **Direct PVs** (`BI_<L>_SHUTTER`, `AI_<L>_ATT`): straight write.

All controls share one write lifecycle via `usePvWrite()` — see
`components/hmi/controls/README.md`.

## Mock backend

```bash
cd backend/mockup-websocket-server && go build && ./eli-hmi-mockup-websocket-server
```

The mock seeds at-rest defaults for all 5 lasers on startup. Sequences hold
their effect-PV writes for 3 s before releasing them back to autosimulated
drift around the last-set value. The 10 % failure injection is **off by
default**; enable it for demos:

```bash
curl http://localhost:8080/mode/fail-rate/10
```

## Confluence-pending items

NL1, NL3, NL4, NL5 mirror NL2's topology because Confluence only documents
NL2 and APL. Once divergent topology is confirmed (chiller bank counts,
flashlamp box ids per laser), edit the per-laser entries in the zone's
`lasers.yaml` — each laser is configured independently. Tracked via
footer comments on the source Confluence page.
