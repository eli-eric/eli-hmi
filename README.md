# ELI Beamlines Control System GUI

Application for **control system operators** and **control system engineers** at ELI Beamlines: a user-friendly operator interface backed by an easy-to-extend GUI framework for engineers who may not be web-frontend developers.

## Project structure

```
frontend/                            Next.js 16 / React 19 / TS app (port 8082)
backend/mockup-websocket-server/     Go simulator (Echo + Gorilla); port 8080
backend/python-websocket-server/     FastAPI + aioca gateway to a real EPICS network
backend/python-hmi/                  DRAFT: the same HMI as one Python process
backend/python-hmi/zones/            one folder per CS zone, one folder per screen
backend/python-hmi/components/       the reusable pieces a screen is built from
backend/python-hmi/core/             zone resolution, EPICS hub, rendering, routes
backend/python-hmi/ioc/              local EPICS IOC, generated from the components
```

Configuration lives inside `frontend/`: `config/global.yaml` declares the zones,
and each module keeps one config file per zone beside its own schema under
`src/app/(modules)/<module>/config/zones/`.

The draft Python HMI configures itself differently: its zones and screens *are*
folders under `backend/python-hmi/zones/`.

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

### Server-rendered HMI (`backend/python-hmi`) — draft

An experiment in collapsing the three boxes above into one: FastAPI + Jinja
render the operator page on the server, [Datastar](https://data-star.dev/)
patches individual cells over Server-Sent Events as PVs report, and `aioca`
talks to EPICS from the same process. No Node, no bundler, no WebSocket
protocol between halves.

Its folder structure *is* its configuration, because each CS zone is a separate
network and the app is deployed into each zone on its own:

```
zones/01/…  zones/TESTZ/…     one folder per zone, one folder per screen inside
components/                   value, group, grid, tally, motor, valve, panel, laser-panel
core/                         how any of it reaches a browser
```

A screen is a folder with a `gui.yaml` in it. Creating one adds a route and a
menu entry; no Python, no registry, no menu to edit. The zone code comes from
`ZONE_CODE` or, unset, from the server's hostname matched against glob patterns
each zone declares in its own `zone.yaml` — so the same image in two zones
serves two different sets of screens, and a station that matches nothing refuses
to start rather than guessing.

```bash
cd backend/python-hmi && pip install -r requirements.txt
make run                  # ZONE_CODE=TESTZ, built-in PV simulator, :8082
```

Three screens: the bespoke **L4 OPCPA** laser panel (a port of the React
module), plus **Chillers** and **Vacuum**, which are YAML only.

It also ships a **local EPICS IOC** in `backend/python-hmi/ioc/`, whose database
is generated from what the components declare, so the app can be run against
real Channel Access on a laptop:

```bash
pip install -r ioc/requirements.txt
python ioc/generate.py    # db + the TESTZ-IOC zone, from the components
make ioc                  # a real IOC: calc records scanning, real alarm limits
make run-ioc              # the HMI against it
```

This replaces `backend/epics/`, whose database was hand-written and had drifted
from the config. See [backend/python-hmi/ioc/README.md](backend/python-hmi/ioc/README.md).

Sign-in is an LDAP bind (the same one the React app does) plus a signed session
cookie, with a built-in `test`/`test` account when `DEV=1`; every screen, stream
and write is behind it, and every sign-in and every write is one line in the
console. Not a production target yet — the visuals have not been reviewed
against the React page and there is no per-user authorisation. See
[backend/python-hmi/README.md](backend/python-hmi/README.md) for the
architecture, [zones/README.md](backend/python-hmi/zones/README.md) for adding a
screen, and [components/README.md](backend/python-hmi/components/README.md) for
adding a new kind of piece.

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
