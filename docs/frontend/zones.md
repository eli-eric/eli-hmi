# Zones

Deployment profiles. Each zone declares which routes are reachable and what shows up in the nav bar. The shipped `production` zone is **intentionally empty**.

## Interface

`src/lib/settings/zone-config.ts`:

```ts
type ZoneConfig = {
  navigationItems: NavItem[]      // visible nav entries
  allowedRoutes: string[]         // route paths the middleware allows
}

const ZONES: Record<string, ZoneConfig> = { test: {...}, production: {...}, ... }
```

The **adapter** is `src/middleware.ts`. It looks up the zone keyed by `ZONE_CODE` and 302-redirects any request whose path isn't in `allowedRoutes` to `/no-access`. The nav bar reads `navigationItems` from the same source, but — being a client component — gets the zone code from `useRuntimeConfig()` (see below) rather than reading `process.env` directly.

## Runtime, not build-time

`ZONE_CODE` is a plain server env var (no `NEXT_PUBLIC_` prefix) supplied by each deployment's `docker-compose.yml` at container start. CI builds one global image with no zone baked in; switching a station's zone is a `docker compose up` with a different `ZONE_CODE`, not a rebuild.

- `middleware.ts` reads `process.env.ZONE_CODE` directly — live, on every request, no extra network call.
- The nav bar (and any other client component) fetches it once via `/api/runtime-config`, exposed through `RuntimeConfigProvider`/`useRuntimeConfig()` (`src/lib/runtime-config/`).

This partially reverses [ADR-0002](../adr/0002-zone-based-access-control.md)'s rejection of "runtime config served from the backend" — see the ADR for the rationale and what still holds (the actual route gate in `middleware.ts` is unaffected: still synchronous, still server-side, still no per-request DB/network lookup).

## Production override

The `production` zone in the repo is deliberately empty (no allowed routes). For real production deployments:

1. **Recommended — per-deployment compose env.** Set `ZONE_CODE=<site-zone>` in that zone's `docker-compose.yml` (see `deployments/zones/testz/docker-compose.yml` for the template) and add a per-site zone entry (e.g. `e3`, `l3bt-hall`, `p3-hall`) to `zone-config.ts`.
2. **Override the empty `production` entry.** Only for one-off deployments. Patch `zone-config.ts` in a fork or at deploy time.

## Adding a page

The middleware enforces zone gating *before* the route handler. If you ship a `page.tsx` without registering it in the relevant zones, the file resolves but every request 302s to `/no-access`. Always:

1. Create the route.
2. Add it to `allowedRoutes` (and optionally `navigationItems`) of every zone that should reach it.

## Tests

`src/middleware.ts` is in the coverage gate. Tests live next to it; they exercise route allow/deny per zone configuration.
