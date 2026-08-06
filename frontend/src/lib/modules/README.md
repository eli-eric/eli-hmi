# Module configs

> Architecture context: [`docs/frontend/module-pages.md`](../../../../docs/frontend/module-pages.md). End-to-end recipe: [`docs/workflows/adding-a-control-page.md`](../../../../docs/workflows/adding-a-control-page.md).

P3, L3BT, and L4fBT share a `ModuleConfig` data shape that drives
`<ModuleControlPage>`. The app owns the schema and loading code in this
directory; the editable data lives in the runtime config directory under
`modules/<module>/config.yaml`.

## Files and ownership

- `module-config-schema.ts` — strict Zod schema, YAML parser, and inferred
  types. The file format adds `schemaVersion: 1`; the object passed to the UI
  retains the original `ModuleConfig` shape.
- `types.ts` — compatibility type exports for components.
- `module-config-loader.ts` — resolves the current zone's module reference,
  parses it, deeply freezes it, and caches successful production reads.
- `eli-hmi-config/schemas/module-config.schema.json` — generated editor schema;
  never hand-edit it.
- `eli-hmi-config/modules/{p3,l3bt,l4fbt}/config.yaml` — controls-owned data.

The small route `page.tsx` files are server entries. They call
`loadModuleConfig(key)` and pass the result to a colocated `'use client'` view,
which composes `<ModuleControlPage>` with the module's bespoke `bottomRow`.

## Adding a new module

1. Add the module key and route to `MODULE_ROUTES` in
   `src/lib/settings/zone-schema.ts`, to `MODULE_CONFIG_KEYS` in
   `module-config-loader.ts`, and to the exhaustive parser registry in
   `src/lib/settings/module-config-validation.ts`.
2. Add `modules/<module>/config.yaml` to the config directory. Start with:

   ```yaml
   # yaml-language-server: $schema=../../schemas/module-config.schema.json
   schemaVersion: 1
   heading: My Module
   # interlocks, safetyPermission, cleanDryAir, backing, roughing …
   ```

   Use the generated schema/editor completion and an existing module file for
   the complete shape.
3. Add bespoke parts under
   `src/app/(modules)/<module>-controls/parts/`. Their PV-to-component wiring
   stays React code because it is structural.
4. Add a dynamic server page and explicit client view following one of the
   existing three routes.
5. Add `modules.<module>.config` to every zone that should validate the data.
   Add its route/nav entry only to zones that should expose the page.
6. Run `npm run validate:config -- --dir ../eli-hmi-config --all` plus the
   normal test/build gates.

## What goes in YAML vs. `parts/`?

| Lives in `ModuleConfig` YAML | Lives in `parts/` TSX |
| --- | --- |
| Interlocks (PV name + title pairs) | Volumes with mixed `VolumePanel.*` children |
| Safety permissions | Connectors, gates, and cross-module hyperlinks |
| Backing, roughing, and clean-dry-air sensor/pump data | Any non-uniform structural composition |

The split is deliberate: the shared panels have data-only variance, while the
bottom rows differ as component trees. Do not turn JSX into a YAML component
language.

## PV names

Store logical PV names. `useWebSocketData` applies the development prefix
internally; the production backend receives the raw names.

### Deliberate placeholders

The migration preserves every legacy placeholder, duplicate, and TODO comment
instead of inventing control-system names. Examples in the YAML include
`undefined1:PRESSURE`, `AI_RPM_SPEED_P000`, and P3 entries that intentionally
reuse the EGV501 PV for the SGV503 label.

The bespoke bottom-row files were intentionally out of migration scope, so
their existing placeholders (for example `SI_???` and `AI_RPM_SPEED_P04`) also
remain in TSX. Replace any placeholder only after controls confirms the
canonical PV.

Useful searches from the repository root:

```bash
grep -RIn 'TODO\|undefined[0-9]' eli-hmi-config/modules/{p3,l3bt,l4fbt}
grep -RIn 'TODO\|SI_???\|AI_RPM_SPEED_P04' frontend/src/app/'(modules)'/{p3,l3bt,l4fbt}-controls/parts
```
