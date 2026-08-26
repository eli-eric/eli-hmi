# Mock-up EPICS WebSocket Gateway

> Architecture context: [`docs/backend/mock-server.md`](../../docs/backend/mock-server.md). Mock-vs-Python split recorded in [ADR-0005](../../docs/adr/0005-mock-vs-python-backend-split.md). Run: [`docs/runbooks/running-mock-backend.md`](../../docs/runbooks/running-mock-backend.md).

A lightweight Go service that fakes an EPICS gateway:

- **One simulator per unique PV**—no matter how many clients subscribe
- Auto-generated values for `AI_` (analog / float) and `BI_` (binary / bool) PVs
- Optional _manual_ mode: you can freeze a PV at a value you choose
- Stateless REST endpoint to set (or override) any PV on the fly
- Simple JSON WebSocket API (`subscribe` / `unsubscribe`)

---

## Quick start

### Run from source

```bash
export MOCKUP_JWT_HS256_SECRET=dev-secret
go run main.go
```

If `MOCKUP_JWT_HS256_SECRET` is not set, the server will try
`NEXTAUTH_SECRET`. If neither is set, the mockup server runs in local
compatibility mode (no signature verification, actor best-effort from token).

The server listens on **`localhost:8080`**.
Change the port (and the simulation/manual flags) by editing the constants at the top of _main.go_:

```go
var (
    aiMode = 1 // 1 = auto-simulate, 2 = manual-only
    biMode = 1 // 1 = auto-simulate, 2 = manual-only
    // ...
)
```

### Run with Docker

```bash
docker build -t mockup-ws-gateway .
docker run -p 8080:8080 mockup-ws-gateway
```

---

## WebSocket API

Connect to **`ws://localhost:8080/ws/pvs?auth=jwt_token_please`**.

With a configured secret, the token must be an HS256 JWT containing a
non-empty `username` claim (or `preferred_username` / `name` / `sub`).
You can also pass `Authorization: Bearer <jwt>` header during the handshake.

### Subscribe

Many PVs share one `subscription_id`, so a dashboard sends one frame instead of
one per PV:

```jsonc
// request
{
  "type": "subscribe",
  "subscription_id": "fe-1",
  "pvs": ["AI_TEMP", "BI_DOOR"],
}
```

Re-using an existing `subscription_id` replaces that subscription's PV list —
PVs no longer listed are released.

### Unsubscribe

A `subscription_id` addresses the whole subscription; any `pvs` sent alongside
it is ignored:

```jsonc
{
  "type": "unsubscribe",
  "subscription_id": "fe-1",
}
```

### Legacy per-PV form

Frames without a `subscription_id` still work and are handled as one single-PV
subscription per PV:

```jsonc
{
  "type": "unsubscribe",
  "pvs": { "BI_DOOR": true },
}
```

### Set PV (aka caput)

```jsonc
{
  "type": "set",
  "pvs": { "BI_DOOR": true, "AI_MOTOR_POS_X": 42.5 },
}
```

### Server → client payload

```jsonc
{
  "type": "pv",
  "name": "AI_TEMP",
  "value": 42.5, // float for AI_*, bool for BI_*
  "severity": 0,
  "ok": true,
  "timestamp": 1746000001.7116504,
  "units": "°C",
}
```

A fresh message is broadcast roughly every **400 ms** (by default) for every PV that remains in _auto-simulate_ mode.

---

## REST API (manual overrides)

Mutation endpoints require `Authorization: Bearer <jwt>`. With a configured
secret (`MOCKUP_JWT_HS256_SECRET` or fallback `NEXTAUTH_SECRET`), tokens are
HS256-verified and must include actor claim (`username` preferred).

Even if a PV is in _auto_ mode you can override its value at any time; the change is broadcast immediately to every subscriber.

| Verb | Path               | Value rules                                                                                                     |
| ---- | ------------------ | --------------------------------------------------------------------------------------------------------------- |
| GET  | `/pv/:name/:value` | \_`AI\__`PV →`:value` is parsed as **float64**<br>\*`BI\_\*`PV →`:value` is parsed as **bool** (`true`/`false`) |

Examples

```bash
# Set an analog input to 37 °C
curl http://localhost:8080/pv/AI_TEMP/37.0

# Trip a binary input
curl http://localhost:8080/pv/BI_DOOR/true
```

If `aiMode` or `biMode` is `2` (manual-only) the simulator stops its random updates for that prefix; the PV holds whatever manual value you last set.

---

## How it works (under the hood)

1. The **first** client that mentions a PV creates a global _simulator_ (`pvSim`), which
   - owns a single ticker goroutine,
   - keeps the latest value,
   - holds a subscriber list.

2. Every 400 ms the simulator:
   - updates the value (unless the prefix is in manual-only mode),
   - broadcasts one JSON blob to **all** connected WebSockets that subscribed.

3. Simulators outlive their subscribers. Like a real IOC, a PV keeps its value
   when nobody is monitoring it — otherwise the frontend's partial-removal flow
   (unsubscribe the group, re-subscribe the survivors) would reset every seeded
   PV to a fresh random value.

That’s it—no external dependencies, no storage, perfect for demos and front-end integration tests.
