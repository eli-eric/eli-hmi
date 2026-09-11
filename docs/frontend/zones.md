# Zones

Deployment profiles. A zone says what the header calls a station and which
module pages it turns on; everything else about it is derived.
Since [ADR-0012](../adr/0012-in-repo-config.md) zones live in the app repo and
ship inside the image — `ZONE_CODE` picks one at runtime.

## Interface

`frontend/config/global.yaml`:

```yaml
zones:
  test:
    title: L4 OPCPA          # header name; omitted → "ELI HMI"
    modules:                 # order = menu order; first entry = home route
      - { key: l4-opcpa, text: L4 OPCPA Controls }
      - { key: p3 }          # no `text`: reachable, hidden from the menu
```

A zone exists exactly when it is a key under `zones:`. Valid module keys are
`l4-opcpa`, `p3`, `l3bt` and `l4fbt`.

**Routes are not written here.** They come from the `MODULES` registry in
`src/lib/settings/zone-schema.ts`, so a route cannot be misspelled in config,
and the three lists this format used to carry — `navigationItems`,
`allowedRoutes`, `modules` — collapse into one. `zone-service.ts` derives them:

| Derived | From |
|---|---|
| `allowedRoutes` | every entry's registry route, in order |
| `navigationItems` | entries carrying `text`, in order |
| home route | `allowedRoutes[0]` |

Validation is zod (`zone-schema.ts`); loading and caching live in
`src/lib/settings/config-loader.ts`, behind the unchanged sync `zone-service.ts`
API.

The **adapter** is the Next.js 16 `src/proxy.ts` entrypoint (Node runtime — it
can use the filesystem-backed loader). It redirects any request whose path is
not an enabled module's route to `/no-access`. The nav bar — being a client
component — receives `navigationItems`/`homeRoute` from `/api/runtime-config`
via `useRuntimeConfig()` instead.

## Per-module, per-zone config

Each module keeps its own config beside its schema, one file per zone:

```
frontend/src/app/(modules)/<module>/config/zones/<ZONE_CODE>.yaml
```

Because stations run against different PVs, the whole file is selected by zone
— nothing is merged or layered. **There is no fallback to a shared default:** a
zone that enables a module must ship that module's file, or the build fails.
Silently serving another station's PV names is worse than failing.

Files for modules a zone does *not* enable are still validated on every build,
so turning one on later is a one-line change that cannot be the first time its
data gets checked.

L4 OPCPA uses its laser-specific schema; p3/l3bt/l4fbt share `ModuleConfig`.
The vacuum pages' bespoke parts remain TSX.

## One image, every station

`ZONE_CODE` is a plain server env var supplied by each deployment's
`docker-compose.yml` (see `deployments/zones/testz/docker-compose.yml`). Every
zone is in the image, so pointing a station at a different existing zone is a
compose edit plus a restart — no rebuild. Changing config *content* is a PR and
a redeploy.

Failure policy:

- **Build time** is the gate. `npm run validate:config` runs as `prebuild`, so
  broken config fails `next build`. It also prints the full zone → module →
  file resolution.
- **Startup** logs a summary and never exits. The only failure left is a
  `ZONE_CODE` naming no zone; it is reported with the list of valid zones and
  the UI serves `/no-access`. A crash-loop would be invisible behind
  `restart: unless-stopped` ("the port is dead"); this is diagnosable.
- **Per request**, zone lookups degrade to the empty zone rather than throwing.

This supersedes the `zone-config.ts` hardcoded map and partially reverses
[ADR-0002](../adr/0002-zone-based-access-control.md)'s rejection of runtime zone
selection (the route gate itself is unchanged: synchronous, server-side, no
per-request network lookup — one cached fs read per process).

## Adding a page

Proxy enforces zone gating *before* the route handler. Ship a `page.tsx`
without enabling it and every request redirects to `/no-access`. Always:

1. Create the route.
2. Register the module in `MODULES` (`zone-schema.ts`) and its parser in
   `MODULE_CONFIG_PARSERS` (`module-config-validation.ts`).
3. Add `config/zones/<ZONE_CODE>.yaml` under the module for every zone that
   will enable it.
4. Add `{ key: <module> }` to those zones in `config/global.yaml`, with `text`
   if it belongs in the menu.

## Tests

`src/proxy.ts` is in the coverage gate. Tests live next to it and point the
loader at a throwaway config root via `setConfigRootForTests`; they exercise
route allow/deny per zone. Schema and loader tests: `zone-schema.test.ts`,
`config-loader.test.ts`, `validate-config-cli.test.ts`.

Test config roots are built in temp dirs at run time (`src/test/config-root.ts`)
rather than checked in — `outputFileTracingIncludes` patterns match at any
depth, so a checked-in `config/global.yaml` fixture would be traced into the
production image alongside the real one.
