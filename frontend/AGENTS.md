# Repository Guidelines (frontend)

## Project Structure & Module Organization

- Next.js app centered in `src/app` (routes, providers).
- `src/lib/websocket/` — WebSocket layer: connection hook, data hook, provider, types, `PVDisplay`, `debug` helper.
- `src/lib/settings/` — zone schema + runtime config loader + helpers (`getDefaultRoute`, `isRouteAllowed`).
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
- Create `.env.local` from `env.example` before running (`NEXTAUTH_SECRET`, `API_URL`, `ZONE_CODE`; `CONFIG_DIR` may stay unset for the in-repo dev fallback).

## Testing

- Vitest + React Testing Library + jsdom.
- Two WebSocket test seams:
  - `mockWebSocketServer()` in `src/test/ws-mock-server.ts` — replaces `globalThis.WebSocket`. Use for `useWebSocket` connection-lifecycle and integration tests. Honors the real wire protocol (`{type:'subscribe', pvs}` ↔ `{type:'pv', name, value, ...}`).
  - `<TestWebSocketProvider value={fakeContext}>` + `makeFakeWebSocketContext()` in `src/test/ws-test-provider.tsx` — short-circuits the connection layer for fast component tests.
- Coverage gate scope: `src/lib/websocket/**`, `src/lib/settings/**`, `src/proxy.ts`, `src/components/module-page/**`. HMI compounds (`src/components/hmi/**`) and UI primitives are not in the gate yet — add tests as their PV maps stabilize.

## Coding Style & Naming Conventions

- TypeScript, strict mode; prefer function components with named exports and explicit prop types.
- Absolute imports via `@/` (e.g. `@/lib/websocket/use-websocket-data`).
- Filenames: kebab-case for non-component modules. Files whose export is a single React component MAY use PascalCase matching the component (`ActionButton.tsx`, `VolumePanel.tsx`); the `components/hmi/{controls,laser-panel,volume-panel,connector-line}/` subtrees do this. `components/hmi/status-bar/` uses kebab-case. Pick one within a directory; don't mix.
- Formatting: single quotes, no semicolons (`.prettierrc.json`).
- Client components declare `'use client'`; keep React state minimal and colocated.
- Use theme tokens from `src/app/globals.css` (`--color-*`, `--shadow-*`); avoid inline hex.
- WebSocket data: always go through `useWebSocketData` — never call `getPrefixedPV` at a read-side call site.

## Zones (CSI-861)

`ZONE_CODE` selects `zones/<ZONE_CODE>.yaml` at **runtime** from the config directory (`CONFIG_DIR`; deployments mount it at `/app/zone-config`, while local development falls back to `../eli-hmi-config`). No zone list exists in code — a zone exists iff its file does. The Next.js 16 Proxy (`src/proxy.ts`, Node runtime) blocks routes not in the zone's `allowedRoutes`; the client nav sources `navigationItems`/`homeRoute` from `/api/runtime-config` via `useRuntimeConfig()`. Adding a page means adding an `allowedRoutes` entry (and optional nav item) to every zone file that should expose it.

Runtime module YAML currently covers only L4 OPCPA's per-laser topology and signal PV names. The p3/l3bt/l4fbt `ModuleConfig` objects and their bespoke `parts/` remain TypeScript/TSX in this app.

Config is validated at server start (`src/instrumentation.ts`; prod exits non-zero on broken config) and by `npm run validate:config -- --dir <path> --all`. Schemas regenerate with `npm run gen:schema` (drift-tested). See `docs/adr/0011-runtime-zone-config.md`.

### Production deployment

Set `ZONE_CODE=<site>` + mount the config repo clone at `CONFIG_DIR` in that site's `docker-compose.yml` (see `deployments/zones/testz/docker-compose.yml`); add `zones/<site>.yaml` to the config repo. No rebuild required — CI ships one global image.

## Commit & Pull Request Guidelines

- Short imperative subjects; include ticket refs like `OPHMI-15` when applicable.
- PRs describe the change, rationale, and validation steps; attach screenshots/GIFs for UI updates and note any config/env impacts.
- Keep changes scoped; prefer focused PRs over large mixed updates.

## Security & Configuration Tips

- Never commit secrets; use `.env.local` for local credentials.
- Validate auth- and websocket-related changes against expected URLs and zones before merging.
