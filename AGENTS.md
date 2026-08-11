# AGENTS.md

Guidance for coding agents (Claude Code etc.) working in this repository.

For architecture, runbooks, ADRs, and the canonical map of the codebase, start at [`/docs/`](./docs/README.md). Wiki mirror: published to the GitHub Wiki on push to `dev`.

## Workflow

- When entering plan mode or producing any implementation plan, invoke the `tdd` skill and structure the plan around it: failing test first, minimal code to pass, refactor.

## Repo layout

- `frontend/` — Next.js 16 / React 19 / TypeScript app. App Router. Has its own `CLAUDE.md` and `AGENTS.md`.
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
API_URL=localhost:8080
ZONE_CODE=test                       # see "Zones" below
# CONFIG_DIR=../eli-hmi-config       # dev fallback; deployments mount /app/zone-config
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

### Zones (runtime access control, CSI-861)

Runtime env vars `ZONE_CODE` + `CONFIG_DIR` (no `NEXT_PUBLIC_` prefix — supplied by each deployment's `docker-compose.yml`) select `zones/<ZONE_CODE>.yaml` from the mounted config directory (`/app/zone-config` in containers; in-repo development fallback: `eli-hmi-config/`). There is no zone list in code — a zone exists iff its file does. The Next.js 16 Proxy (`src/proxy.ts`, Node runtime) enforces routes on every request; the client nav gets `navigationItems`/`homeRoute` from `/api/runtime-config` via `useRuntimeConfig()`. **To add a page, allow its route in the zone file(s) or Proxy redirects it to `/no-access`.**

L4 OPCPA laser data and the p3/l3bt/l4fbt `ModuleConfig` data are loaded from
the zone's referenced runtime YAML. The bespoke p3/l3bt/l4fbt `parts/` wiring
remains TSX because it is structural rather than data-only.

Config is validated at container start (`src/instrumentation.ts`): broken/missing config exits non-zero in production (visible crash-loop), warns in dev. Pre-deploy check: `npm run validate:config -- --dir <config-dir> --all`. See ADR-0011.

CI builds one global frontend image; `ZONE_CODE`/`API_URL`/`CONFIG_DIR` are never baked in, so switching zones (or changing config) is a compose restart, not a rebuild.

### Module pages

Three control pages (`l3bt-controls`, `l4fbt-controls`, `p3-controls`) all use a single `<ModuleControlPage config={...} bottomRow={...} />` (`src/components/module-page/module-control-page.tsx`). A small dynamic server page loads the zone-referenced YAML through `src/lib/modules/module-config-loader.ts`; a colocated client view renders the typed `ModuleConfig`. The `bottomRow` slot is bespoke per-module JSX — volumes and connectors with site-specific structural wiring stay in `src/app/(modules)/<m>-controls/parts/`.

To add a new module: add its key/route to the supported-module maps, create `modules/<m>/config.yaml` in the config directory, add a server page + client view under `src/app/(modules)/<m>-controls/`, and reference/allow it in the relevant zone files. See `frontend/src/lib/modules/README.md`.

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
- `frontend-test` — `npm ci && npm test -- --run --coverage` with threshold gate. Fails if coverage drops below 70/70/70/60 on `src/lib/websocket/**`, `src/lib/settings/**`, `src/lib/modules/**`, `src/proxy.ts`, `src/components/module-page/**`.
- `docker-build-job-frontend` — builds and pushes the frontend image to Harbor. One global image for every deployment zone; `ZONE_CODE`/`API_URL` are supplied at runtime by each zone's `docker-compose.yml`, not baked in by CI (see [docs/frontend/zones.md](docs/frontend/zones.md)).
- `docker-build-job-demo`, `docker-build-job-mockup-demo`, `docker-build-job-python` — build and push the demo frontend and mock/Python backend images to Harbor.
