# L4 OPCPA Control System

Operator UI for the L4 OPCPA laser system. Five lasers (NL1–NL5) rendered
side-by-side, each with five stacked sections (General, Regen, Chillers,
Flashlamps, Modbox).

**Source spec:** [Confluence — Requirements: L4 OPCPA Control System](https://eli-eric.atlassian.net/wiki/spaces/CS/pages/2333902150)

## Architecture

```
app/(modules)/l4-opcpa/
├── page.tsx                  # Custom page shell (does NOT use ModuleControlPage — see below)
├── page.module.css
├── lib/
│   ├── pv-names.ts           # PV-name registry — canonical source for BI_/AI_/SI_/CMD_ names
│   └── pv-names.test.ts
└── components/
    ├── laser-grid.tsx        # CSS grid wrapper, 4 columns, wraps to 4+1
    ├── color-legend.tsx      # Wireframe colour legend at the top
    ├── laser-specs.ts        # LASER_SPECS array — per-laser topology (counts, IDs, presets)
    └── laser-panel-instance.tsx  # Renders one laser by unpacking a LaserSpec

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

`laser-specs.ts` lives under this module's `components/` (not under
`lib/modules/`) because it's a different config type: per-page **topology**
(laser counts, chiller ids, delay presets) rather than the panel-layout
`ModuleConfig` consumed by `ModuleControlPage`. Mixing the two in
`lib/modules/` would conflate independent concepts.

When/if a Python EPICS gateway exposes `GET /lasers`, this static config
should be replaced with a fetch + the topology becomes the canonical source.

## PV naming + backend mirror

Every PV name is constructed via `pv.*` builders in
`l4-opcpa/lib/pv-names.ts`. The mock backend
(`backend/mockup-websocket-server/l4_opcpa.go`) hand-mirrors the same names.
A header comment in `l4_opcpa.go` points back here as the canonical source.

```ts
import { pv } from '@/app/(modules)/l4-opcpa/lib/pv-names'

pv.shutter('NL2')               // 'BI_NL2_SHUTTER'
pv.flashlampChannel('NL2','22','1') // 'SI_NL2_FL_22_CH1'
pv.cmd('NL2', 'START_LASER')    // 'CMD_NL2_START_LASER'
pv.mssAll('NL2', 6)             // ['BI_NL2_MSS_1', ..., 'BI_NL2_MSS_6']
```

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
flashlamp box ids per laser), extend `LASER_SPECS` per-entry. Tracked via
footer comments on the source Confluence page.
