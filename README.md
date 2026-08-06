# ELI Beamlines Control System GUI

Application for **control system operators** and **control system engineers** at ELI Beamlines: a user-friendly operator interface backed by an easy-to-extend GUI framework for engineers who may not be web-frontend developers.

## Project structure

```
frontend/                            Next.js 16 / React 19 / TS app (port 8082)
backend/mockup-websocket-server/     Go simulator (Echo + Gorilla); port 8080
backend/python-websocket-server/     FastAPI + aioca gateway to a real EPICS network
eli-hmi-config/                      Zone-config template + dev default (CSI-861) — per-zone
                                     navigation/routes and L4 OPCPA PV config, mounted at runtime;
                                     future seed for a controls-team config repo
```

The two backends speak the **same WebSocket protocol** (`/ws/pvs`); the frontend doesn't know which is on the other end.

## Frontend

Next.js 16, App Router, TypeScript, CSS Modules. Operator pages are composed from a per-module **config object** (`src/lib/modules/<m>.config.ts`) that drives a shared `<ModuleControlPage>` shell. WebSocket data flows through a single hook `useWebSocketData(pv | { pvs })` that buries the dev-vs-prod PV-name prefix.

See [frontend/README.md](frontend/README.md) for setup, environment variables, the WebSocket pub/sub protocol, and how to add a new control module.

**Zone configuration:** which pages a deployment shows (top navigation and allowed routes) comes from per-zone YAML read **at runtime** from a mounted directory selected by `CONFIG_DIR` + `ZONE_CODE`, not from the build. L4 OPCPA's per-laser topology and signal PV names are runtime YAML too. The p3/l3bt/l4fbt `ModuleConfig` objects and their bespoke volume/connector wiring remain TypeScript/TSX in this app. One image serves every zone; a config change requires a config commit/pull and container restart. [`eli-hmi-config/`](eli-hmi-config/README.md) is the documented template and development default; creating the standalone controls-team repository is still a deployment follow-up. See [ADR-0011](docs/adr/0011-runtime-zone-config.md).

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
