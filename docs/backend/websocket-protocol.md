# WebSocket protocol

The nominal **interface** at the `/ws/pvs` **seam**. Two backend adapters claim to satisfy it. They don't — yet. This page documents what each one actually emits and what the frontend actually sends.

> ⚠ This is the load-bearing question for [ADR-0009](../adr/0009-shared-ws-protocol-contract.md). The ADR is still **Open** — there is no accepted contract that both sides have implemented.

## Common ground

| Aspect | Both backends |
| --- | --- |
| URL path | `/ws/pvs` |
| Auth | `?auth=<jwt>` query parameter on upgrade |
| Subprotocol | none |
| Frame format | JSON text frames |
| One frame | one PV update |

## What the frontend sends today

`src/lib/websocket/use-websocket.ts`:

```jsonc
{ "type": "subscribe",   "pvs": { "<PV_NAME>": true } }   // one or many keys
{ "type": "unsubscribe", "pvs": { "<PV_NAME>": true } }
```

PVs are passed as an *object* keyed by name. There is no `subscription_id`, no `detail`, no `timeout`. The client opens one connection per browser tab; subscriptions are deduplicated locally and replayed on reconnect.

## Mock backend dialect (Go)

Matches the frontend exactly.

```jsonc
// client → server
{ "type": "subscribe", "pvs": { "AI_TEMP": true } }

// server → client (per-PV broadcast, every updatePeriodMs)
{ "type": "pv",
  "name": "AI_TEMP",
  "value": 42.5,
  "severity": 0,
  "ok": true,
  "timestamp": 1746000001.7,
  "units": "°C",
  "error": "" }
```

Frames:

| `type` | Direction | Notes |
| --- | --- | --- |
| `subscribe` | →  | object-keyed PVs |
| `unsubscribe` | →  | object-keyed PVs |
| `set` | →  | mock-only, sets a value as if `caput` |
| `pv` | ← | single frame type for everything |

## Python backend dialect

Richer surface. Different frame contract.

```jsonc
// server → client on open
{ "type": "connected", "operation": "monitor",
  "connection_id": "abc123def456",
  "limits": { "max_pvs_per_subscription": 64,
              "max_subscriptions_per_connection": 32 } }

// client → server
{ "type": "subscribe", "subscription_id": "main",
  "pvs": ["DEVICE:PV1", "DEVICE:PV2"],
  "detail": "time", "timeout": 2.0,
  "all_updates": false, "notify_disconnect": true }
```

Frames:

| `type` | Direction | Notes |
| --- | --- | --- |
| `connected` | ← | first frame on every connection; carries `connection_id` and limits |
| `subscribe` | →  | `pvs` is an **array**; client picks the `subscription_id` |
| `subscribed` | ← | ack |
| `snapshot` | ← | initial value per PV after subscribe |
| `event` | ← | subsequent updates |
| `unsubscribe` | →  | by `subscription_id` |
| `unsubscribed` | ← | ack |
| `ping` / `pong` | → / ← | keepalive |
| `error` | ← | structured error envelope |

## The gap

| | Mock | Python | Frontend |
| --- | --- | --- | --- |
| `pvs` shape | object | **array** | object |
| `subscription_id` | absent | required | absent |
| Initial value frame | normal `pv` | dedicated `snapshot` | handled as `pv` |
| Updates | `pv` | `event` | handled as `pv` |
| Connection ack | none | `connected` | ignored |
| Per-frame `name`, `value`, `severity`, `units`, `timestamp`, `ok` | yes | yes (via `pv_serialization`) | yes |

The frontend will not deserialise the Python server's frames as written. The Python server will not parse the frontend's `pvs:{...}` subscribe payload as written.

## What this means in practice

- `NEXT_PUBLIC_API_URL=localhost:8080` → `ws://localhost:8080/ws/pvs` (mock) — works.
- `NEXT_PUBLIC_API_URL=<python-host>:<port>` → `ws://<python-host>:<port>/ws/pvs` — does **not** work without changes on either side.

## How to resolve

Three options, ordered by decreasing locality:

1. **Adopt the Python dialect on the frontend** (and emulate it in the mock). Highest leverage long-term; biggest one-time change.
2. **Add a compatibility shim to the Python server** for the legacy frame shape. Easiest to land; pushes complexity to the wrong side (the server learns dialects of clients).
3. **Define a third, deliberate contract** and migrate both adapters to it. Best vocabulary; most coordination.

See [ADR-0009](../adr/0009-shared-ws-protocol-contract.md). This page tracks the gap; the ADR decides the direction.
