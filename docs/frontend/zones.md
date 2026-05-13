# Zones

Build-time deployment profiles. Each zone declares which routes are reachable and what shows up in the nav bar. The shipped `production` zone is **intentionally empty**.

## Interface

`src/lib/settings/zone-config.ts`:

```ts
type ZoneConfig = {
  navigationItems: NavItem[]      // visible nav entries
  allowedRoutes: string[]         // route paths the middleware allows
}

const ZONES: Record<string, ZoneConfig> = { test: {...}, production: {...}, ... }
```

The **adapter** is `src/middleware.ts`. It looks up the zone keyed by `NEXT_PUBLIC_ZONE_CODE` and 302-redirects any request whose path isn't in `allowedRoutes` to `/no-access`. The nav bar reads `navigationItems` from the same source.

## Build-time, not runtime

`NEXT_PUBLIC_*` env vars are baked into the bundle at build time. Switching zones means a rebuild — there is no runtime zone toggle. See [ADR-0002](../adr/0002-zone-based-access-control.md).

## Production override

The `production` zone in the repo is deliberately empty (no allowed routes). For real production builds use one of:

1. **Recommended — per-deployment build env.** Set `NEXT_PUBLIC_ZONE_CODE=<site-zone>` at build time and add a per-site zone entry (e.g. `e3`, `l3bt-hall`, `p3-hall`).
   - Docker: `docker build --build-arg NEXT_PUBLIC_ZONE_CODE=p3-hall ...`
   - GitLab CI: project/group variable `NEXT_PUBLIC_ZONE_CODE`
   - Local prod build: `.env.production`
2. **Override the empty `production` entry.** Only for one-off deployments. Patch `zone-config.ts` in a fork or at deploy time.

## Adding a page

The middleware enforces zone gating *before* the route handler. If you ship a `page.tsx` without registering it in the relevant zones, the file resolves but every request 302s to `/no-access`. Always:

1. Create the route.
2. Add it to `allowedRoutes` (and optionally `navigationItems`) of every zone that should reach it.

## Tests

`src/middleware.ts` is in the coverage gate. Tests live next to it; they exercise route allow/deny per zone configuration.
