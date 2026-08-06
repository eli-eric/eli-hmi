# Zones

Deployment profiles (CSI-861). Each zone declares which routes are reachable,
what shows up in the nav bar, and references config for supported runtime
modules (currently L4 OPCPA).
Since [ADR-0011](../adr/0011-runtime-zone-config.md) zones are **files in a
runtime-mounted config directory**, not code.

## Interface

`zones/<ZONE_CODE>.yaml` in the config dir (`CONFIG_DIR` env; dev default
`eli-hmi-config/` at the repo root — its README documents the full format):

```yaml
schemaVersion: 1
navigationItems: [{ text: L4 OPCPA Controls, href: /l4-opcpa }]
allowedRoutes: [/l4-opcpa]          # first entry = home route
modules:
  l4-opcpa: { config: modules/l4-opcpa/lasers.yaml }
```

There is **no zone list in the app** — a `ZONE_CODE` is valid exactly when its
file exists. Validation: zod (`src/lib/settings/zone-schema.ts`), loaded +
cached by `src/lib/settings/zone-config-loader.ts`, exposed through the
unchanged sync `zone-service.ts` API.

The `modules:` extension point currently accepts only `l4-opcpa`; its YAML
contains per-laser topology and signal PV names. The p3/l3bt/l4fbt
`ModuleConfig` objects and bespoke parts remain TypeScript/TSX.

The **adapter** is the Next.js 16 `src/proxy.ts` entrypoint (Node runtime — it
can use the filesystem-backed loader). It redirects any request whose path
isn't in `allowedRoutes` to `/no-access`. The nav bar — being a client
component — receives `navigationItems`/`homeRoute` from `/api/runtime-config`
via `useRuntimeConfig()` instead.

## Runtime, not build-time

`ZONE_CODE` + `CONFIG_DIR` are plain server env vars supplied by each
deployment's `docker-compose.yml`; the config dir is a read-only volume mount
of a config checkout (currently the in-repo template; eventually the
controls-team repository — see
`deployments/zones/testz/docker-compose.yml`). CI builds one global image with
no zone baked in; switching a station's zone — or changing its config — is a
compose restart, not a rebuild.

Failure policy: the whole config is validated at server start
(`src/instrumentation.ts`) — production exits non-zero on a broken/missing
config (visible crash-loop at deploy); per-request lookups degrade to the
empty zone (`/no-access`). Pre-deploy check:
`npm run validate:config -- --dir <config-dir> --all`.

This supersedes the `zone-config.ts` hardcoded map and partially reverses
[ADR-0002](../adr/0002-zone-based-access-control.md)'s rejection of runtime
config (the route gate itself is unchanged: synchronous, server-side, no
per-request network lookup — one cached fs read per process).

## Adding a page

Proxy enforces zone gating *before* the route handler. If you ship a
`page.tsx` without allowing it in the relevant zone files, the file resolves
but every request redirects to `/no-access`. Always:

1. Create the route.
2. Add it to `allowedRoutes` (and optionally `navigationItems`) of every zone
   file that should reach it.

## Tests

`src/proxy.ts` is in the coverage gate. Tests live next to it and stub
`CONFIG_DIR` to the fixture dir in `src/lib/settings/__fixtures__/config-dir/`;
they exercise route allow/deny per zone file. Schema/loader tests:
`zone-schema.test.ts`, `zone-config-loader.test.ts`, drift tests for the
generated JSON Schemas.
