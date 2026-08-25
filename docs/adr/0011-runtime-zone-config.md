# ADR-0011: Runtime zone configuration from a mounted, controls-owned config dir

**Status:** Accepted
**Date:** 2026-07-30
**Deciders:** ELI-HMI team, controls team (CSI-861)
**Supersedes:** the build-time-loading decision of [ADR-0010](0010-per-laser-yaml-config.md) (its YAML/zod format stands); the hardcoded zone map that backed the original zone-service

> **Amended (CSI-861 follow-up):** the generated JSON Schemas this ADR
> describes were removed. They only ever powered editor autocomplete, the
> controls team requires their config repo to hold hand-written YAML and
> nothing else, and its members edit in different editors, so the feature had
> no dependable consumer. Zod remains the single source for validation and
> types; the config format is now documented in prose under `eli-hmi-config/`,
> and `validate:config` also ships as a container image.

## Context

CSI-861: one frontend image must serve multiple deployment environments
("zones" — e.g. `L4`, `TESTZ`): test zones against mock backends, production
against real PVs. The zone also decides which GUIs exist and appear in the top
navigation. Two mechanisms conflicted with that:

- `lasers.yaml` was read at `next build` (static prerender, ADR-0010) — config
  baked into the image, so different PV sets require different builds.
- Navigation + allowed routes were a hardcoded TS map (`zone-config.ts`) keyed
  by `'test' | 'production'` — adding a zone or changing nav meant an app
  commit + rebuild.

The controls team owns the config content and wants it **versioned in git but
outside the app codebase**, decoupled from app builds.

## Decision

Zone + module config moves to a **config directory mounted into the container
at runtime**, read via `CONFIG_DIR` + `ZONE_CODE` env:

- **Layout contract:** `zones/<ZONE_CODE>.yaml` (one file per zone; the code
  IS the filename — no zone list in the app) + `modules/<module>/…` files
  referenced from zone files by relative path. A zone file holds
  `schemaVersion`, `navigationItems`, `allowedRoutes`, and `modules.<name>.config`
  refs. The in-repo `eli-hmi-config/` is simultaneously the dev fallback
  (`CONFIG_DIR` unset → `../eli-hmi-config`) and the ready-to-copy template
  for the future standalone controls-team repo.
- **App stays schema owner.** Zod schemas (`zone-schema.ts`,
  `module-config-schema.ts`, and l4-opcpa `config/schema.ts`) remain in the
  app; JSON Schemas are generated into
  `eli-hmi-config/schemas/` (`npm run gen:schema`, drift-tested) for editor
  DX, and `npm run validate:config -- --dir <path> --all` runs the real
  validation for the config repo's CI.
- **Loading:** sync `readFileSync` + process-lifetime cache
  (`zone-config-loader.ts`); container restart = reload. Next.js 16
  `proxy.ts` performs route gating in the Node runtime using the fs-backed
  zone-service. Every runtime-configured module page is `force-dynamic` and
  passes validated data from a small server entry to its client view; client
  nav gets zone data via `/api/runtime-config` (extended with
  `navigationItems` + `homeRoute`).
- **Failure policy:** per-request zone lookups degrade to the empty zone
  (`/no-access`), but `instrumentation.ts` validates the whole config at
  server start and **exits non-zero in production** — a config error is a
  visible crash-loop at deploy, not a silently useless UI. A module-file
  failure after startup surfaces as a page error.
- **Scope:** L4 OPCPA uses a laser-specific runtime schema; p3/l3bt/l4fbt use
  the shared `ModuleConfig` runtime schema. Their bespoke bottom-row JSX stays
  in the app because it is structural, not data-only.

## Consequences

- Positive: one image for all zones; config changes are a config-repo commit +
  container restart; zones are added by adding a file; controls team owns
  content without app-repo access.
- Positive: validation is layered — editor (JSON Schema), config-repo CI
  (`validate:config`), container start (fail-fast), per-request zone lookup
  (degrade).
- Negative: `next build` no longer validates deployment module data — the
  failure surface moves from app-image CI to config CI/deploy (crash-looping
  container). Mitigated by the config-repo CI step.
- Note: the request gate uses Next.js 16 `proxy.ts`, whose default Node runtime
  supports the filesystem-backed zone loader. Verify that path in the
  standalone image on Next upgrades.
- Note: the fs/exit work of the startup check lives in `instrumentation-node.ts`,
  dynamically imported behind the `NEXT_RUNTIME` guard, so the edge compilation
  of `instrumentation.ts` emits no "Node.js API not supported in Edge Runtime"
  build warnings. If such warnings reappear after a Next upgrade, check that
  the guard still dead-code-eliminates for the edge bundle.
- Note: `/api/runtime-config` is deliberately unauthenticated and now returns
  the zone's nav items + home route pre-auth (rationale in the route file);
  flagged for a security-posture review rather than silently accepted.
- Open: final zone naming at cutover (`test` vs `TESTZ`); creating the actual
  standalone config repo (copy-out procedure in `eli-hmi-config/README.md`).

## Alternatives considered

- **Bake per-zone config at build (N builds).** Rejected — contradicts "same
  image everywhere", multiplies CI artifacts.
- **Config API service (`GET /config/<zone>`).** Rejected for now — a new
  service to run; the mount achieves the same with less. `loadZoneFile` is the
  seam if this changes.
- **Git-sync sidecar with hot reload.** Rejected — more moving parts;
  restart-to-reload is acceptable and predictable for operators.
- **Monorepo config dir as the deployment source.** Rejected — controls team
  explicitly wants config versioned outside the app codebase.
