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
`src/lib/modules/`. The data lives beside each module, one file per zone:

```text
src/app/(modules)/
├── p3-controls/config/zones/test.yaml
├── l3bt-controls/config/zones/test.yaml
└── l4fbt-controls/config/zones/test.yaml
```

The path is derived from the `MODULES` registry plus `ZONE_CODE`, so there is
no reference to resolve — and no fallback if a zone's file is missing, since a
station coming up on another station's PV names would be worse than a failed
build.

At request time, the dynamic server `page.tsx` calls `loadModuleConfig(key)`
and passes the deeply frozen result to a colocated client view. Production
caches the validated object for the process lifetime; development reparses on
each request.

## Why split this way

The five shared panels vary only in data, so one validated schema captures
their variance without module-specific JSX. The bottom row has structural
variance: different sub-volume counts, compound children, and cross-module
links. Forcing that into YAML would either explode the schema or recreate JSX
as an awkward data language.

This is `ModuleControlPage`'s **depth**: a small interface
(`config + bottomRow`) renders five fully wired panels, and per-zone data files
let one image drive stations whose PV sets differ.

## Adding a module

See the full [adding-a-control-page workflow](../workflows/adding-a-control-page.md).
In outline:

1. Register the module in `MODULES` (`zone-schema.ts`), `moduleConfigKeyMap`
   (`module-config-loader.ts`) and `MODULE_CONFIG_PARSERS`
   (`module-config-validation.ts`).
2. Add a dynamic server page, a client view, and bespoke `parts/` under
   `src/app/(modules)/<key>-controls/`.
3. Add `config/zones/<ZONE_CODE>.yaml` under that directory for every zone that
   will enable it.
4. Add `{ key: <module> }` to those zones in `config/global.yaml` — with `text`
   only if the page belongs in the menu.

## PV naming inside configs

Store the same **logical** names the previous TypeScript config used.
`useWebSocketData` applies the development prefix on subscribe. See
[pv-naming](../reference/pv-naming.md).

Several existing entries carry placeholder or duplicated PV names. They are
deliberately preserved in YAML rather than guessed during migration. See
[`frontend/src/lib/modules/README.md`](../../frontend/src/lib/modules/README.md#deliberate-placeholders).

## Validation and tests

- `npm run validate:config` runs as `prebuild`, so broken data fails
  `next build`. It parses **every** module YAML on disk — including files for
  zones not rolled out yet and modules no zone enables — and prints the full
  zone → module → file resolution.
- The format is documented in prose in
  [`frontend/src/lib/modules/README.md`](../../frontend/src/lib/modules/README.md);
  there is no generated JSON Schema.
- `src/components/module-page/**` remains inside the coverage gate.
