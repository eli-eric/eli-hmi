# AGENTS.md

Guidance for coding agents (Claude Code etc.) working in this repository.

For architecture, runbooks, ADRs, and the canonical map of the codebase, start at [`/docs/`](./docs/README.md). Wiki mirror: published to the GitHub Wiki on push to `dev`.

## Workflow

- When entering plan mode or producing any implementation plan, invoke the `tdd` skill and structure the plan around it: failing test first, minimal code to pass, refactor.

## Repo layout

- `frontend/` — Next.js 16 / React 19 / TypeScript app. App Router. Has its own `CLAUDE.md` and `AGENTS.md`.
- `backend/mockup-websocket-server/` — Go (Echo + Gorilla) simulator that fakes EPICS PVs for local dev.
- `backend/python-websocket-server/` — FastAPI + `aioca` gateway that talks to a real EPICS network. Production target.
- `backend/python-hmi/` — **draft**: the whole HMI as one Python process (FastAPI + Jinja server-side rendering + Datastar over SSE + `aioca`), replacing the frontend *and* the gateway. Its structure is its config: `zones/<CODE>/<screen>/gui.yaml` (a folder is a screen — route and menu entry come from the listing), `components/` (the reusable pieces, Python + Jinja, used from YAML), `core/` (zone resolution, EPICS hub, rendering, routes). Zone code from `ZONE_CODE` or the hostname against globs in each `zone.yaml`. Three READMEs, one per audience; own test suite (`make test`); built-in PV simulator (`EPICS_BACKEND=sim`) so it needs no IOC and no Node. Sign-in lives in `core/auth.py` (LDAP simple bind as `<user>@LDAP_UPN_DOMAIN`, plus a `test`/`test` account when `DEV=1`) and `core/login.py` (the form, and the middleware that gates every route — `PUBLIC_PATHS` is the whole exception list). `SESSION_SECRET` is required unless `DEV=1`. Auth events and every write are logged with the actor; the password and the cookie never are.
- `backend/python-hmi/ioc/` — a local EPICS IOC whose database is **generated** from what the components declare (`python ioc/generate.py --zone TESTZ`), not from hand-written records. Runs from a pip install via pythonSoftIOC — no EPICS build — or as a stock `softIoc` in Docker. Replaced `backend/epics/`, whose hand-written db had drifted from the config; add a screen and regenerate, never edit `ioc/db/*.db`.

The two backends speak the **same WebSocket protocol** (`/ws/pvs`); the frontend doesn't know which is on the other end.

## Commands

Frontend (run from `frontend/`):
- `npm run dev` — Turbopack dev server. **Port 8082, not 3000.** Same for `build`/`start`.
- `npm run lint` — ESLint.
- `npm test` / `npm run test:run` — Vitest. `npm run test:coverage` runs with the CI threshold gate (70/70/70/60).

Mockup backend: `cd backend/mockup-websocket-server && go run main.go` (port 8080).

Python backend: `cd backend/python-websocket-server && fastapi dev server.py`.

Server-rendered HMI: `cd backend/python-hmi && make run` (ZONE_CODE=TESTZ, simulator, port 8082 — same as the frontend, so run one or the other); `make run-zone ZONE=01` for another zone, `make components` lists the registry. `make test` runs its own suite; it shares no code with `frontend/` or the other backends, and deliberately re-implements the presentation rules from `frontend/src/lib/websocket/` in Python rather than importing anything.

Local IOC for that app: `python ioc/generate.py`, then `make ioc` (a real EPICS IOC on CA 5064) and `make run-ioc` in another shell (the HMI against it). `make ioc-verify` is the CA smoke test. `generate.py` also writes a generated `zones/<ZONE>-IOC/` zone, identical to the real one except for PVs naming a *field* of a synApps record — no base-only IOC can serve a name with a dot in it — and answering to no hostname, so a station can never resolve to it.

Mock server has REST helpers: `GET /pv/:name/:value` to set a value, `GET /mode/:prefix/:value` to switch a PV-prefix between auto-sim and manual.

## Required env (`frontend/.env.local`)

```
NEXTAUTH_SECRET=...
API_URL=localhost:8080
ZONE_CODE=test                       # see "Zones" below
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

`ZONE_CODE` (no `NEXT_PUBLIC_` prefix — supplied by each deployment's `docker-compose.yml`) selects a zone from `frontend/config/global.yaml`, which ships inside the image. A zone lists the modules it enables, in menu order; routes come from the `MODULES` registry in `zone-schema.ts`, never from config. The Next.js 16 Proxy (`src/proxy.ts`, Node runtime) enforces routes on every request; the client nav gets `navigationItems`/`homeRoute` from `/api/runtime-config` via `useRuntimeConfig()`. **To add a page, enable its module in the relevant zones or Proxy redirects it to `/no-access`.**

L4 OPCPA laser data and the p3/l3bt/l4fbt `ModuleConfig` data are loaded from
the zone's referenced runtime YAML. The bespoke p3/l3bt/l4fbt `parts/` wiring
remains TSX because it is structural rather than data-only.

Config is validated at **build** (`npm run validate:config`, wired as `prebuild`), so broken config fails `next build`, not a container. Startup (`src/instrumentation.ts`) logs a summary and never exits — an unknown `ZONE_CODE` is reported with the valid zones while the UI serves `/no-access`. See ADR-0012.

CI builds one global frontend image; `ZONE_CODE`/`API_URL` are never baked in, so pointing a station at a different existing zone is a compose restart. Changing config content is a PR plus a redeploy.

### Module pages

Three control pages (`l3bt-controls`, `l4fbt-controls`, `p3-controls`) all use a single `<ModuleControlPage config={...} bottomRow={...} />` (`src/components/module-page/module-control-page.tsx`). A small dynamic server page loads the zone-referenced YAML through `src/lib/modules/module-config-loader.ts`; a colocated client view renders the typed `ModuleConfig`. The `bottomRow` slot is bespoke per-module JSX — volumes and connectors with site-specific structural wiring stay in `src/app/(modules)/<m>-controls/parts/`.

To add a new module: register it in `MODULES` (`zone-schema.ts`), `moduleConfigKeyMap` (`module-config-loader.ts`) and `MODULE_CONFIG_PARSERS` (`module-config-validation.ts`); add a server page + client view under `src/app/(modules)/<m>-controls/`; add `config/zones/<ZONE_CODE>.yaml` there for every zone that enables it; and list it in those zones in `config/global.yaml`. See `frontend/src/lib/modules/README.md`.

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
