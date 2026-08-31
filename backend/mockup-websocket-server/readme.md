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

The socket speaks the real gateway's **batched protocol** (see
`backend/python-websocket-server/api_contract.py`); the old per-PV map-shaped
protocol was removed. On connect the server greets with a `connected` frame
carrying the limits (max 64 PVs per subscription, 32 subscriptions per
connection).

### Subscribe

```jsonc
// request
{
  "type": "subscribe",
  "subscription_id": "fe-1",
  "pvs": ["AI_TEMP", "BI_DOOR"],
  "detail": "time", // "value" | "time" | "control"; default "value"
}
```

The server replies with a `subscribed` ack, then one `snapshot` per PV, then
`event` frames as values or severities change. Re-subscribing an existing
`subscription_id` replaces it. Invalid frames get an `error` frame
(`invalid_message`, `too_many_pvs`, `too_many_subscriptions`).

### Unsubscribe

```jsonc
{
  "type": "unsubscribe",
  "subscription_id": "fe-1",
}
```

Answered with an `unsubscribed` ack (`ok: false` for an unknown id).

### Server → client payload

```jsonc
{
  "type": "event", // "snapshot" for the initial value
  "operation": "monitor",
  "subscription_id": "fe-1",
  "pv": "AI_TEMP",
  "detail": "time",
  "ok": true,
  "value": 42.5, // float for AI_*, 0/1 for BI_*, string for SI_*
  "metadata": {
    // at detail "time" and "control":
    "status": 0,
    "severity": 0, // 0 NONE, 1 MINOR, 2 MAJOR, 3 INVALID
    "timestamp": 1746000001.7116504,
    // at detail "control" only:
    "units": "°C",
  },
}
```

An `event` is broadcast on every change: value drift every **300 ms** (by
default) for PVs in _auto-simulate_ mode, manual writes immediately, and
severity episode transitions.

### Severity episodes

Independent of the value modes, every PV randomly enters sticky severity
episodes: MINOR (~1%/tick), MAJOR (~0.3%) or INVALID (~0.1%), held for a
random 5–15 s, then back to NONE. This exercises the frontend's alarm
styling without real alarms. Disable/enable globally:

```bash
curl http://localhost:8080/mode/severity/2   # off (clean demo screen)
curl http://localhost:8080/mode/severity/1   # on (default)
```

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

3. When the _last_ subscriber for a PV disconnects, the simulator shuts down and is removed from the registry.

That’s it—no external dependencies, no storage, perfect for demos and front-end integration tests.
