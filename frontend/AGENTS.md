# Repository Guidelines (frontend)

## Project Structure & Module Organization

- Next.js app centered in `src/app` (routes, providers).
- `src/lib/websocket/` — WebSocket layer: connection hook, data hook, provider, types, `PVDisplay`, `debug` helper.
- `src/lib/settings/` — zone schema + runtime config loader + helpers (`getDefaultRoute`, `isRouteAllowed`).
- `src/lib/modules/` — `ModuleConfig` schema/types + loader for the shared `<ModuleControlPage>`; data lives at `src/app/(modules)/<m>-controls/config/zones/<ZONE_CODE>.yaml`.
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
- Coverage gate scope: `src/lib/websocket/**`, `src/lib/settings/**`, `src/lib/modules/**`, `src/proxy.ts`, `src/components/module-page/**`. HMI compounds (`src/components/hmi/**`) and UI primitives are not in the gate yet — add tests as their PV maps stabilize.

## Coding Style & Naming Conventions

- TypeScript, strict mode; prefer function components with named exports and explicit prop types.
- Absolute imports via `@/` (e.g. `@/lib/websocket/use-websocket-data`).
- Filenames: kebab-case for non-component modules. Files whose export is a single React component MAY use PascalCase matching the component (`ActionButton.tsx`, `VolumePanel.tsx`); the `components/hmi/{controls,laser-panel,volume-panel,connector-line}/` subtrees do this. `components/hmi/status-bar/` uses kebab-case. Pick one within a directory; don't mix.
- Formatting: single quotes, no semicolons (`.prettierrc.json`).
- Client components declare `'use client'`; keep React state minimal and colocated.
- Use theme tokens from `src/app/globals.css` (`--color-*`, `--shadow-*`); avoid inline hex.
- WebSocket data: always go through `useWebSocketData` — never call `getPrefixedPV` at a read-side call site.

## Zones (CSI-861)

`ZONE_CODE` selects a zone from `config/global.yaml`, which ships inside the image. A zone entry is just `title` plus an ordered list of enabled modules; `allowedRoutes`, `navigationItems` and the home route are **derived** from it in `zone-service.ts`, with routes coming from the `MODULES` registry in `zone-schema.ts` so they cannot be misspelled in config. The Next.js 16 Proxy (`src/proxy.ts`, Node runtime) blocks routes the zone does not enable; the client nav sources `navigationItems`/`homeRoute` from `/api/runtime-config` via `useRuntimeConfig()`. Exposing a page means listing its module in the relevant zones, with `text` if it belongs in the menu.

Each module's data is per zone: `src/app/(modules)/<m>/config/zones/<ZONE_CODE>.yaml`, resolved by convention from the registry. Whole files are selected, never merged, and there is **no fallback** — a zone enabling a module must ship its file, or the build fails.

Runtime YAML covers L4 OPCPA laser data and p3/l3bt/l4fbt `ModuleConfig`
data. The vacuum pages' bespoke `parts/` remain TSX; do not move structural
compound-component wiring into the data schema.

`npm run validate:config` is wired as `prebuild`, so broken config fails `next build` rather than a container. It parses every module YAML on disk — including files for zones that are not rolled out and modules no zone enables — and prints the zone → module → file resolution. Startup (`src/instrumentation.ts`) logs a summary and never exits. There is no generated JSON Schema. See `docs/adr/0012-in-repo-config.md`.

### Production deployment

Add the zone to `config/global.yaml` plus a `config/zones/<site>.yaml` under every module it enables, then set `ZONE_CODE=<site>` in that site's `docker-compose.yml` (see `deployments/zones/testz/docker-compose.yml`). CI ships one global image, so pointing a station at an existing zone needs no rebuild.

## Commit & Pull Request Guidelines

- Short imperative subjects; include ticket refs like `OPHMI-15` when applicable.
- PRs describe the change, rationale, and validation steps; attach screenshots/GIFs for UI updates and note any config/env impacts.
- Keep changes scoped; prefer focused PRs over large mixed updates.

## Security & Configuration Tips

- Never commit secrets; use `.env.local` for local credentials.
- Validate auth- and websocket-related changes against expected URLs and zones before merging.
