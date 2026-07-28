# Repository Guidelines (frontend)

## Project Structure & Module Organization

- Next.js app centered in `src/app` (routes, providers).
- `src/lib/websocket/` — WebSocket layer: connection hook, data hook, provider, types, `PVDisplay`, `debug` helper.
- `src/lib/settings/` — zone-config + helpers (`getDefaultRoute`, `isRouteAllowed`).
- `src/lib/modules/` — typed `ModuleConfig` + per-module configs that drive the shared `<ModuleControlPage>`.
- `src/components/hmi/` — reusable HMI compound components (`VolumePanel`, `ConnectorLine`, `StatusBar`).
- `src/components/ui/` — generic primitives (buttons, dropdown, tooltip, icons, heading).
- `src/components/module-page/` — `<ModuleControlPage>` shell + 5 config-driven panels.
- `src/components/navigation/` — top nav bar, navigation items, logo.
- `src/test/` — Vitest setup + the two WS test adapters: `ws-mock-server.ts` (real-WebSocket replacement) and `ws-test-provider.tsx` (cheap context fake).
- Static assets in `public/`; environment example in `env.example`.

## Build, Test, and Development Commands

- `npm run dev` — start the dev server on port 8082 using Turbopack.
- `npm run build` — production build (also honors port 8082 env in scripts).
- `npm start` — run the built app locally.
- `npm run lint` — Next.js/ESLint rules; fix reported issues before committing.
- `npm test` / `npm run test:run` — Vitest, watch / one-shot.
- `npm run test:coverage` — runs with the CI threshold gate (70/70/70/60 on the include scope).
- Create `.env.local` from `env.example` before running (`NEXTAUTH_SECRET`, `API_URL`, `ZONE_CODE`).

## Testing

- Vitest + React Testing Library + jsdom.
- Two WebSocket test seams:
  - `mockWebSocketServer()` in `src/test/ws-mock-server.ts` — replaces `globalThis.WebSocket`. Use for `useWebSocket` connection-lifecycle and integration tests. Honors the real wire protocol (`{type:'subscribe', pvs}` ↔ `{type:'pv', name, value, ...}`).
  - `<TestWebSocketProvider value={fakeContext}>` + `makeFakeWebSocketContext()` in `src/test/ws-test-provider.tsx` — short-circuits the connection layer for fast component tests.
- Coverage gate scope: `src/lib/websocket/**`, `src/lib/settings/**`, `src/middleware.ts`, `src/components/module-page/**`. HMI compounds (`src/components/hmi/**`) and UI primitives are not in the gate yet — add tests as their PV maps stabilize.

## Coding Style & Naming Conventions

- TypeScript, strict mode; prefer function components with named exports and explicit prop types.
- Absolute imports via `@/` (e.g. `@/lib/websocket/use-websocket-data`).
- Filenames: kebab-case for non-component modules. Files whose export is a single React component MAY use PascalCase matching the component (`ActionButton.tsx`, `VolumePanel.tsx`); the `components/hmi/{controls,laser-panel,volume-panel,connector-line}/` subtrees do this. `components/hmi/status-bar/` uses kebab-case. Pick one within a directory; don't mix.
- Formatting: single quotes, no semicolons (`.prettierrc.json`).
- Client components declare `'use client'`; keep React state minimal and colocated.
- Use theme tokens from `src/app/globals.css` (`--color-*`, `--shadow-*`); avoid inline hex.
- WebSocket data: always go through `useWebSocketData` — never call `getPrefixedPV` at a read-side call site.

## Zones

`ZONE_CODE` selects a zone at **runtime** from `src/lib/settings/zone-config.ts` (a plain server env var, no `NEXT_PUBLIC_` prefix, supplied by docker-compose). The middleware blocks routes not in `allowedRoutes`, reading `ZONE_CODE` live per request; the nav bar (client-side) sources it from `/api/runtime-config` via `useRuntimeConfig()`. Adding a page = adding both the file *and* a route entry.

### Production zone override

The shipped `production` zone is **intentionally empty** (no routes allowed). A real production deployment needs one of:

1. **Per-deployment compose env (recommended)** — set `ZONE_CODE=<deployment-zone>` in that deployment's `docker-compose.yml` (see `deployments/zones/testz/docker-compose.yml`). Add a new entry in `zone-config.ts` for each physical site (e.g. `e3`, `l3bt-hall`, `p3-hall`) with the routes that site is allowed to operate. No rebuild required — CI ships one global image, per-zone config lives entirely in each zone's compose file.

2. **Override the empty `production` entry** — only for one-off deployments that should not introduce a new zone code. Patch `zone-config.ts` in a fork or at deploy time.

## Commit & Pull Request Guidelines

- Short imperative subjects; include ticket refs like `OPHMI-15` when applicable.
- PRs describe the change, rationale, and validation steps; attach screenshots/GIFs for UI updates and note any config/env impacts.
- Keep changes scoped; prefer focused PRs over large mixed updates.

## Security & Configuration Tips

- Never commit secrets; use `.env.local` for local credentials.
- Validate auth- and websocket-related changes against expected URLs and zones before merging.
