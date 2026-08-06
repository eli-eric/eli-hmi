# Architecture

A map of the three top-level **modules** in the eli-hmi stack and the **seams** between them. Vocabulary follows the [improve-codebase-architecture skill](../.agents/skills/improve-codebase-architecture/LANGUAGE.md): *module, interface, implementation, seam, adapter, depth, leverage, locality.*

## Modules

```
┌──────────────────────────┐      WebSocket /ws/pvs       ┌──────────────────────────┐
│  frontend                │ ───────── subscribe ───────▶ │  one of:                 │
│  Next.js 16 / React 19   │ ◀──────── pv frames ──────── │  • mock-backend (Go)     │
│  App Router              │                              │  • python-backend (Py)   │
│                          │                              │    + aioca + EPICS net   │
│  POST /pv/<NAME>         │ ─────── single write ──────▶ │                          │
└──────────────────────────┘      (auth header)           └──────────────────────────┘
```

### 1. `frontend/` — Next.js App Router

The user-facing **module**. Its **interface** is composed of:

- Routes under `src/app/(modules)/<name>/page.tsx`, each gated by a [zone](frontend/zones.md).
- A single **WebSocket client adapter** (`useWebSocket` + `useWebSocketContext`) that consumes whichever backend the runtime-config `API_URL` resolves to (the same host:port serves WS and the write endpoint — see `frontend/src/types/constants.ts` and `frontend/src/lib/runtime-config/`). Callers go through `useWebSocketData` which buries the dev-prefix mapping (see [pv-naming](reference/pv-naming.md)).
- A single **write adapter** — `fetch('POST /pv/<NAME>', { headers: { Authorization } })` — used by exactly two call sites (`WarningErrorControl.tsx`, `DropDownStateControl.tsx`).

Depth claim: `useWebSocketData` is deep. Behind a 2-arity hook (`pv` or `{pvs:[]}`) sits: NextAuth JWT acquisition, reconnect with backoff + jitter, subscription replay, prefix resolution, typed message envelope. Deleting the hook would scatter that complexity across every PV consumer — the deletion test passes.

[Frontend overview →](frontend/overview.md)

### 2. `backend/mockup-websocket-server/` — Go simulator

A development-only **adapter** for the WS protocol. Its **interface** is the wire protocol (subscribe/pv frames) plus a REST side-door for tests (`/pv/:name/:value`, `/mode/:prefix/:value`).

Implementation: one goroutine per unique PV; value inference from PV-name prefix (`AI_*` float, `BI_*` bool, `SI_*` string); ticker broadcasts every ~400 ms unless the prefix is in manual mode.

[Mock server →](backend/mock-server.md)

### 3. `backend/python-websocket-server/` — FastAPI + aioca

The production **adapter**. Its **interface** is a superset of the mock's: subscribe/pv frames *and* a richer dialect with `connection_id`, `subscription_id`, `snapshot`/`event` separation, ping/pong, and limits negotiation. Talks to a real EPICS network via [aioca](https://github.com/DiamondLightSource/aioca).

Also exposes: `GET /pv/<name>` (typed read), `/health/live`, `/health/ready`, `/stats`, `/stats/ui`, and an HTML landing page at `/`.

[Python server →](backend/python-server.md)

## Seams

Three **seams** carry all cross-module traffic. Two adapters exist for the WS seam → it is a real seam, not hypothetical.

### Seam 1: WebSocket pub/sub (`/ws/pvs`)

Where the frontend's WS client meets a backend adapter. JWT is passed as `?auth=<token>` query param — both backends require it.

⚠ **Known divergence.** The mock and Python adapters do not currently satisfy the *same* interface. The mock speaks the legacy frame shape (`{type:'subscribe', pvs:{NAME:true}}` → `{type:'pv', name, value, …}`); the Python server speaks a richer dialect (`subscription_id`, separate `snapshot`/`event` frames). The frontend client currently emits the legacy shape. This is the load-bearing question for [ADR-0009](adr/0009-shared-ws-protocol-contract.md) and detailed in [websocket-protocol](backend/websocket-protocol.md).

### Seam 2: PV write endpoint (`POST /pv/<NAME>`)

Single write adapter at a single seam. See [pv-write-endpoint](backend/pv-write-endpoint.md) and [ADR-0004](adr/0004-single-pv-write-endpoint.md).

### Seam 3: Auth (NextAuth + LDAP)

Server-side LDAP bind on credentials login (or dev bypass `test/test`); the NextAuth JWT is then carried (a) inside the browser session, (b) on the WS subscribe URL, (c) on PV-write requests. See [frontend/auth](frontend/auth.md).

## Module-internal seams (frontend)

Three patterns recur inside the frontend and earn their own pages:

- **Zone config** (`src/lib/settings/zone-schema.ts`, `zone-config-loader.ts`, and `src/proxy.ts`) — runtime access control from `zones/<ZONE_CODE>.yaml` under `CONFIG_DIR`. Proxy is the request adapter; the validated zone file is the interface. See [frontend/zones](frontend/zones.md).
- **ModuleConfig** (`src/lib/modules/types.ts` + per-module config files) — deep declarative shape that drives `<ModuleControlPage>`. Used by three pages today; the pattern is a real seam. See [frontend/module-pages](frontend/module-pages.md). L4 OPCPA opts out — see [ADR-0007](adr/0007-l4-custom-shell-not-modulecontrolpage.md).
- **Compound HMI components** (`components/hmi/{volume-panel,connector-line,laser-panel,controls}`) — parent attaches subcomponents as static properties so pages compose declaratively. See [frontend/hmi-components](frontend/hmi-components.md) and [ADR-0003](adr/0003-compound-components-for-hmi-panels.md).

## Cross-cutting concerns

- **PV naming.** Logical PV names in code (`MOD1.AI_TEMP`) are resolved to prefixed wire names (`DEV:MOD1:AI_TEMP`) by `getPrefixedPV` (`src/lib/utils/pv-helpers.ts`). The hook does this on subscribe; one write site does it inline. See [reference/pv-naming](reference/pv-naming.md).
- **L4 OPCPA PV names.** Signal PV names live as full strings in the zone-referenced runtime YAML; only command PVs are assembled by the page's small registry. See [ADR-0010](adr/0010-per-laser-yaml-config.md) and [frontend/l4-opcpa](frontend/l4-opcpa.md).
- **Runtime config scope.** Zone navigation/routes and L4 OPCPA per-laser signal data come from mounted YAML. The p3/l3bt/l4fbt `ModuleConfig` objects and their bespoke bottom rows remain compiled app code.
