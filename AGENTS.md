# AGENTS.md

This file provides guidance to coding agents (Claude Code etc.) when working with code in this repository.

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
- `npm run lint` — ESLint. No test harness exists.

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

A single app-wide WebSocket connection is established by `useWebSocket` (`src/hooks/useWebsocket.tsx`) and exposed via `WebSocketProvider` / `useWebSocketContext` (`src/app/providers/socket-provider.tsx`). The NextAuth JWT (`session.accessToken`) is sent as a `?auth=` query param — both backends require it. Reconnect uses exponential backoff with jitter.

Components don't call the hook directly. They are wrapped with `withReactWebSocketData` (`src/components/ws-components/with-websocket-data.tsx`), which manages subscribe/unsubscribe lifecycle and passes `data` + `isConnected` as props. For multi-PV components use `useWebSocketMulti` (`src/hooks/useWebSocketData.ts`).

Wire protocol: client sends `{type:'subscribe', pvs:{NAME:true, ...}}`; server pushes `{type:'pv', name, value, severity, units, timestamp, ok}`. Mock server infers value type from PV prefix (`AI_*` float, `BI_*` bool, `SI_*` string).

### Zone-based access control

Build-time env var `NEXT_PUBLIC_ZONE_CODE` selects a zone from `frontend/src/lib/settings/zone-config.ts`. Each zone declares `navigationItems` and `allowedRoutes`. The middleware (`src/middleware.ts`) enforces this on every request — unauthorized routes redirect to `/no-access`. The nav bar reads from the same config. **To add a page, you must register its route in the zone config or it will 403 even when the file exists.**

`production` zone is intentionally empty (no routes allowed) — production deployments must override the config or set a different zone.

### Compound components for operator UIs

Reusable HMI panels (`src/components/ws-components/volume-panel`, `connector-line`) use the compound-component pattern: a parent attaches subcomponents as static properties (`VolumePanel.Title`, `VolumePanel.SensorPressureConnected`, etc.) so engineers compose pages declaratively without managing state. See `frontend/src/examples/` and `frontend/README.md` for the intended authoring style — the audience for new pages is control-system engineers, not React devs.

## Conventions worth knowing

- Path alias `@/` → `frontend/src/`.
- Filenames kebab-case; components PascalCase; hooks `useCamelCase`.
- Prettier: no semicolons, single quotes (see `.prettierrc.json`).
- Client components must declare `'use client'`.
- CSS Modules with kebab-case class names; variants via string interpolation (`styles[\`button-${variant}\`]`).
- Commit subjects are short imperative; prefix with the Jira/issue id when there is one (e.g. `OPHMI-15: ...`).

## CI

`.gitlab-ci.yml` builds and pushes only the **python** backend image to Harbor. Frontend and Go mock image builds are commented out — don't assume CI ships them.
