# ELI Beamlines Control System GUI

Application for **control system operators** and **control system engineers** at ELI Beamlines: a user-friendly operator interface backed by an easy-to-extend GUI framework for engineers who may not be web-frontend developers.

## Project structure

```
frontend/                            Next.js 16 / React 19 / TS app (port 8082)
backend/mockup-websocket-server/     Go simulator (Echo + Gorilla); port 8080
backend/python-websocket-server/     FastAPI + aioca gateway to a real EPICS network
```

Configuration lives inside `frontend/`: `config/global.yaml` declares the zones,
and each module keeps one config file per zone beside its own schema under
`src/app/(modules)/<module>/config/zones/`.

The two backends speak the **same WebSocket protocol** (`/ws/pvs`); the frontend doesn't know which is on the other end.

## Frontend

Next.js 16, App Router, TypeScript, CSS Modules. The P3/L3BT/L4fBT operator
pages load a validated **ModuleConfig** YAML at runtime and pass it to the
shared `<ModuleControlPage>` shell; their structurally bespoke bottom rows stay
in TSX. WebSocket data flows through a single hook
`useWebSocketData(pv | { pvs })` that buries the dev-vs-prod PV-name prefix.

See [frontend/README.md](frontend/README.md) for setup, environment variables, the WebSocket pub/sub protocol, and how to add a new control module.

**Zone configuration:** `frontend/config/global.yaml` declares every zone and
the module pages it turns on; each module carries its own YAML per zone, because
stations run against different PVs. This covers L4 OPCPA laser data and the
P3/L3BT/L4fBT `ModuleConfig` data — only their bespoke volume/connector wiring
remains TSX.

The config ships **inside the image** and `ZONE_CODE` selects a zone at runtime,
so one image still serves every station and switching a station between existing
zones is a compose restart. Changing config *content* is a PR plus a redeploy,
and `npm run validate:config` runs as `prebuild` so broken config fails the
build rather than a container. See
[ADR-0012](docs/adr/0012-in-repo-config.md).

## Backend

### Mockup WebSocket Server (`backend/mockup-websocket-server`)

Go application that simulates a control system. Two modes per PV-prefix:

- **automatic simulation** — generates random data
- **manual** — accepts values via REST helpers (`GET /pv/:name/:value`, `GET /mode/:prefix/:value`)

For development and testing only. Not a production target.

### Python WebSocket Server (`backend/python-websocket-server`)

FastAPI + `aioca` gateway that talks to a real EPICS network. **Production target** — built and pushed to Harbor by `.gitlab-ci.yml`.

## Quick start

```bash
# Start frontend (:8082) and mock backend (:8080)
docker compose up --build
```

Open `http://localhost:8082` and log in with `test` / `test`.

This compose quick start uses dedicated local Dockerfiles with standard public images and local-safe defaults, so you do not need to install Go or Node.js or create `frontend/.env.local` first.

If you prefer to run the services directly on your machine instead of Docker:

```bash
# Mock backend
cd backend/mockup-websocket-server && go run main.go      # :8080

# Frontend
cd frontend && cp env.example .env.local                  # set NEXTAUTH_SECRET
npm install && npm run dev                                # :8082
```

Login `test` / `test` (bypasses LDAP in dev). See [frontend/AGENTS.md](frontend/AGENTS.md) for full environment variable list and zone configuration.

## Conventions

- Frontend port is **8082**, not 3000.
- Commits are short imperative; prefix with the Jira/issue id (e.g. `OPHMI-15: ...`).
- See [AGENTS.md](AGENTS.md) for repository-wide guidance for coding agents.
