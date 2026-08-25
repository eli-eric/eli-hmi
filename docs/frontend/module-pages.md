# Module pages

The pattern that drives `/p3-controls`, `/l3bt-controls`, and
`/l4fbt-controls`: one renderer, runtime-loaded per-module data, and bespoke
bottom-row JSX. [L4 OPCPA deliberately opts out](l4-opcpa.md).

## Interface

```tsx
<ModuleControlPage config={config} bottomRow={<MyBottomRow />} />
```

- `config: ModuleConfig` — validated declarative data for heading,
  interlocks, safety permission, clean-dry-air, backing, and roughing panels.
- `bottomRow: ReactNode` — bespoke JSX for volumes and connectors whose wiring
  differs structurally between modules.

The app owns the strict Zod schema and derived TypeScript types under
`src/lib/modules/`. The controls-owned data lives in the mounted config
directory:

```text
eli-hmi-config/
├── modules/
│   ├── l3bt/config.yaml
│   ├── l4fbt/config.yaml
│   └── p3/config.yaml
└── zones/test.yaml                  # modules.<key>.config references
```

At request time, the dynamic server `page.tsx` calls `loadModuleConfig(key)`
and passes the deeply frozen result to a colocated client view. Production
caches the validated object for the process lifetime; development reparses on
each request. Container restart is the reload boundary in deployments.

## Why split this way

The five shared panels vary only in data, so one validated schema captures
their variance without module-specific JSX. The bottom row has structural
variance: different sub-volume counts, compound children, and cross-module
links. Forcing that into YAML would either explode the schema or recreate JSX
as an awkward data language.

This is `ModuleControlPage`'s **depth**: a small interface
(`config + bottomRow`) renders five fully wired panels while the runtime loader
lets controls change their data without rebuilding the app.

## Adding a module

See the full [adding-a-control-page workflow](../workflows/adding-a-control-page.md).
In outline:

1. Register the module key/route in the app's supported-module maps and parser
   registry.
2. Add `modules/<key>/config.yaml` with `schemaVersion: 1` to the config
   directory.
3. Add a dynamic server page, a client view, and bespoke `parts/` under
   `src/app/(modules)/<key>-controls/`.
4. Add `modules.<key>.config` to each zone that should validate the data; add
   the route/nav entry only to zones that should expose the page.

## PV naming inside configs

Store the same **logical** names the previous TypeScript config used.
`useWebSocketData` applies the development prefix on subscribe. See
[pv-naming](../reference/pv-naming.md).

Several existing entries carry placeholder or duplicated PV names. They are
deliberately preserved in YAML rather than guessed during migration. See
[`frontend/src/lib/modules/README.md`](../../frontend/src/lib/modules/README.md#deliberate-placeholders).

## Validation and tests

- `npm run validate:config -- --dir <config-dir> --all` validates every module
  file referenced by every zone and warns about orphan YAML files.
- Production startup validates every referenced file before serving traffic.
- The format is documented in prose in `eli-hmi-config/modules/README.md`;
  there is no generated JSON Schema.
- `src/components/module-page/**` remains inside the coverage gate.
