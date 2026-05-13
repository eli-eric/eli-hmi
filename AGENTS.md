# AGENTS.md

Guidance for coding agents (Claude Code etc.) working in this repository.

## Workflow

- When entering plan mode or producing any implementation plan, invoke the `tdd` skill and structure the plan around it: failing test first, minimal code to pass, refactor.

## Repo layout

- `frontend/` — Next.js 15 / React 19 / TypeScript app. App Router. Has its own `CLAUDE.md` and `AGENTS.md`.
- `backend/mockup-websocket-server/` — Go (Echo + Gorilla) simulator that fakes EPICS PVs for local dev.
- `backend/python-websocket-server/` — FastAPI + `aioca` gateway that talks to a real EPICS network. Production target.

The two backends speak the **same WebSocket protocol** (`/ws/pvs`); the frontend doesn't know which is on the other end.

## Commands

Frontend (run from `frontend/`):
- `npm run dev` — Turbopack dev server. **Port 8082, not 3000.** Same for `build`/`start`.
- `npm run lint` — ESLint.
- `npm test` / `npm run test:run` — Vitest. `npm run test:coverage` runs with the CI threshold gate (70/70/70/60).

Mockup backend: `cd backend/mockup-websocket-server && go run main.go` (port 8080).

Python backend: `cd backend/python-websocket-server && fastapi dev server.py`.

Mock server has REST helpers: `GET /pv/:name/:value` to set a value, `GET /mode/:prefix/:value` to switch a PV-prefix between auto-sim and manual.

## Required env (`frontend/.env.local`)

```
NEXTAUTH_SECRET=...
NEXT_PUBLIC_WEBSOCKET_URL=ws://localhost:8080/ws/pvs
NEXT_PUBLIC_ZONE_CODE=test           # see "Zones" below
LDAP_SERVER_URL=ldap://10.78.0.11    # only used in prod auth
LDAP_BASE_DN=dc=lcs,dc=local
```

Dev login: `test` / `test` bypasses LDAP (`src/lib/server/auth/ldap-auth.ts`).

## Architecture: things that span multiple files

### WebSocket pub/sub for EPICS PVs

Single app-wide WebSocket connection established by `useWebSocket` (`src/lib/websocket/use-websocket.ts`) and exposed via `WebSocketProvider` / `useWebSocketContext` (`src/app/providers/socket-provider.tsx`). NextAuth JWT (`session.accessToken`) sent as a `?auth=` query param — both backends require it. Reconnect uses exponential backoff with jitter; on reopen, every stored channel is re-subscribed via `replaySubscriptions()`.

Components subscribe via `useWebSocketData` (`src/lib/websocket/use-websocket-data.ts`):

```ts
useWebSocketData(pv: string)              → { data,  isConnected }
useWebSocketData({ pvs: string[] })       → { byPv, state, isConnected }
```

The hook **buries** the dev-vs-prod PV-name prefix (`getPrefixedPV` in `src/lib/utils/pv-helpers.ts`). Callers pass logical names; the hook resolves them on subscribe and on lookup. The only direct call site for `getPrefixedPV` is the write-side `fetch()` in `WarningErrorControl.tsx` and `DropDownStateControl.tsx`.

`PVDisplay` (`src/lib/websocket/pv-display.tsx`) renders the resulting `Message<T>` with sensible loading / error / disconnected fallbacks.

Wire protocol: client sends `{ type: 'subscribe', pvs: { NAME: true, ... } }`; server pushes `{ type: 'pv', name, value, severity, units, timestamp, ok }`. Mock server infers value type from PV prefix (`AI_*` float, `BI_*` bool, `SI_*` string).

### Zones (build-time access control)

Build-time env var `NEXT_PUBLIC_ZONE_CODE` selects a zone from `frontend/src/lib/settings/zone-config.ts`. Each zone declares `navigationItems` and `allowedRoutes`. The middleware (`src/middleware.ts`) enforces this on every request — unauthorized routes redirect to `/no-access`. The nav bar reads from the same config. **To add a page, register its route in the zone config or it will 403 even if the file exists.**

`production` zone is intentionally empty (no routes allowed) — production deployments override the config or set a different zone code at **build time**. See `frontend/AGENTS.md` for the override mechanism (`docker build --build-arg`, GitLab CI variable, or `.env.production`).

`NEXT_PUBLIC_*` is baked at build time. There is no runtime zone switch — switching zones means a rebuild.

### Module pages

Three control pages (`l3bt-controls`, `l4fbt-controls`, `p3-controls`) all use a single `<ModuleControlPage config={...} bottomRow={...} />` (`src/components/module-page/module-control-page.tsx`). The `config` is a typed `ModuleConfig` (`src/lib/modules/types.ts`) carried in `src/lib/modules/<m>.config.ts`. The `bottomRow` slot is bespoke per-module JSX — volumes and connectors with site-specific PV wiring stay in `src/app/(modules)/<m>-controls/parts/`.

To add a new module: write a new `<m>.config.ts`, add a new page under `src/app/(modules)/<m>-controls/page.tsx` rendering `<ModuleControlPage>`, register the route in `zone-config.ts`. See `frontend/src/lib/modules/README.md`.

### Compound HMI components

Reusable HMI panels (`src/components/hmi/volume-panel`, `connector-line`) use the compound-component pattern: a parent attaches subcomponents as static properties (`VolumePanel.Title`, `VolumePanel.SensorBar`, etc.) so engineers compose pages declaratively without managing state. See `frontend/README.md`.

## Conventions worth knowing

- Path alias `@/` → `frontend/src/`.
- Filenames kebab-case for non-component modules (`use-websocket-data.ts`, `pv-helpers.ts`); hooks `useCamelCase`. Files whose default/named export is a single React component MAY use PascalCase matching the component name (`ActionButton.tsx`, `VolumePanel.tsx`) — the existing `components/hmi/{controls,laser-panel,volume-panel,connector-line}/` subtrees follow this; `components/hmi/status-bar/` uses kebab-case. Pick one within a directory; don't mix.
- Prettier: no semicolons, single quotes (see `.prettierrc.json`).
- Client components must declare `'use client'`.
- CSS Modules with kebab-case class names; variants via string interpolation (`styles[\`button-${variant}\`]`).
- Theme tokens are defined in `src/app/globals.css` (`--color-*`, `--shadow-*`, `--border-radius-*`). Prefer tokens over hex literals.
- Commit subjects are short imperative; prefix with the Jira/issue id when there is one (e.g. `OPHMI-15: ...`).

## CI

`.gitlab-ci.yml`:
- `frontend-test` — `npm ci && npm test -- --run --coverage` with threshold gate. Fails if coverage drops below 70/70/70/60 on `src/lib/websocket/**`, `src/lib/settings/**`, `src/middleware.ts`, `src/components/module-page/**`.
- `docker-build-job` — builds and pushes the Python backend image to Harbor.
Frontend Docker build is currently commented out (deployment plumbing tracked separately).
