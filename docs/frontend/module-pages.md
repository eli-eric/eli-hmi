# Module pages

The pattern that drives `/p3-controls`, `/l3bt-controls`, `/l4fbt-controls`. One renderer; per-module configs. [L4 OPCPA deliberately opts out](l4-opcpa.md).

## Interface

```tsx
<ModuleControlPage config={myConfig} bottomRow={<MyBottomRow />} />
```

- `config: ModuleConfig` — typed declarative description of the five fixed panels (heading, interlocks, safety permission, clean-dry-air, backing, roughing).
- `bottomRow: ReactNode` — bespoke JSX (volumes + connectors with site-specific PV wiring).

`ModuleConfig` lives at `src/lib/modules/types.ts`. Per-module configs live alongside:

```
src/lib/modules/
├── types.ts
├── l3bt.config.ts
├── l4fbt.config.ts
└── p3.config.ts
```

## Why split this way

The five top panels share a uniform shape — they vary only in *data* (PV names, titles, sensor counts), so a typed config captures all variance without ever touching JSX. The bottom row, by contrast, has *structural* variance: number of sub-volumes, mix of compound children, cross-module hyperlinks. Forcing it into the config would either explode the schema or push it back into JSX through a glob of conditionals. Keeping the bottom row as a slot is the boundary where declarative stops paying.

This is `ModuleControlPage`'s **depth**: a small interface (`config + bottomRow`) ferries five fully-wired panels into the page.

## Adding a module

(Full recipe: [workflows/adding-a-control-page](../workflows/adding-a-control-page.md).)

1. New `src/lib/modules/<m>.config.ts`.
2. New `src/app/(modules)/<m>-controls/page.tsx` rendering `<ModuleControlPage>`.
3. Per-module `parts/` for volumes + connectors.
4. Register `/-controls` route + nav item in [zone config](zones.md).

## PV naming inside configs

Pass **logical** names. `useWebSocketData` applies the dev-prefix on subscribe. See [pv-naming](../reference/pv-naming.md).

Several existing entries carry placeholder PV names — they are deliberate, not oversights. See [`frontend/src/lib/modules/README.md`](../../frontend/src/lib/modules/README.md#deliberate-placeholders).

## Tests

`src/components/module-page/**` is inside the coverage gate (70/70/70/60). Tests live next to the panels they exercise.
