# ADR-0002: Zone-based access control

**Status:** Accepted
**Date:** 2025-04-30
**Deciders:** ELI-HMI team

## Context

The same frontend bundle serves multiple physical control rooms. Each station should only reach the pages relevant to its hardware. We needed a way to gate routes that is:

- **Tamper-resistant** at runtime — operators shouldn't be able to URL-poke into other modules.
- **Auditable** — a deployed station's allowed pages are inspectable from one file.
- **Cheap** — no per-request DB lookup.

## Decision

A build-time **zone** keyed by `NEXT_PUBLIC_ZONE_CODE`. The zone descriptor (`{navigationItems, allowedRoutes}`) lives in `src/lib/settings/zone-config.ts` — that file is the **interface**. The **adapter** is `src/middleware.ts`, which 302-redirects any request whose path isn't in `allowedRoutes` to `/no-access`. The nav bar reads the same config.

`NEXT_PUBLIC_*` is baked into the bundle at build time — there is no runtime zone switch. Switching zones means a rebuild.

## Consequences

- **Positive — locality.** All access-control bugs concentrate in `middleware.ts` + `zone-config.ts`. The middleware is in the [coverage gate](../frontend/overview.md#coverage-gate).
- **Positive — leverage.** New pages are gated for free by adding a string to `allowedRoutes`; no per-route code.
- **Negative — operational.** The shipped `production` zone is intentionally empty, which means *every* production deployment must supply a per-site zone at build time. This is documented in [zones](../frontend/zones.md) but is the single most common deployment mistake.
- **Open.** Per-user access (separate from per-station) is out of scope. If/when needed, layer over zones rather than replace them.

## Alternatives considered

- **Runtime config served from the backend.** Rejected — adds a request before any page renders; complicates middleware; loses build-time auditability.
- **Per-user role-based auth.** Rejected for now — the operational model is "station-as-role." If user-level granularity becomes necessary, add it as a second check inside the middleware without removing the zone gate.

## Update (2026-07-28): partial reversal for deployment ergonomics

CI now builds one global frontend image (no per-zone builds); each zone's `docker-compose.yml` supplies `ZONE_CODE` (and `API_URL`) at container start instead. This is exactly the "runtime config served from the backend" alternative rejected above — reconsidered because building/publishing a separate image per physical station didn't scale as station count grew, and the objections above turned out not to apply to the actual security-relevant path:

- **No added request before render.** `ZONE_CODE` has no `NEXT_PUBLIC_` prefix, so `middleware.ts` reads it directly via `process.env` on every request — live, synchronous, no network lookup. This is unchanged from the original decision; only how the value gets into the container changed (docker-compose env vs. a build arg).
- **Middleware is not more complicated.** `zone-service.ts`'s helpers gained an optional `zoneCode` override param; `middleware.ts` itself has zero new logic.
- **Auditability moves from "inspect the built image" to "inspect the deployment's compose file."** A station's allowed pages are still inspectable from one file — just `deployments/zones/<zone>/docker-compose.yml` instead of the CI build-arg that produced the image.

What *is* new: client components (the nav bar) can no longer read `ZONE_CODE` via inlined `process.env` at all (dropping the prefix removes inlining entirely), so they fetch it once from a small `/api/runtime-config` route via `useRuntimeConfig()` (`frontend/src/lib/runtime-config/`). This is purely cosmetic — it affects only which nav items render, not which routes are reachable, so it doesn't reintroduce the "request before any page renders" concern for the actual gate.
