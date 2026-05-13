# Python server (FastAPI + aioca)

`backend/python-websocket-server/`. Production target. Talks to a real EPICS network via [aioca](https://github.com/DiamondLightSource/aioca). **Read/monitor only** at present — no write endpoint yet.

## What it is

A FastAPI app whose **interface** is HTTP + WebSocket. The implementation is built around a `WebSocketPVsManager` that owns:

- a shared-monitor pool (one aioca `camonitor` per unique PV regardless of subscriber count)
- per-connection subscription bookkeeping
- limits (`max_pvs_per_subscription`, `max_subscriptions_per_connection`)
- stats snapshots

## Module layout (`backend/python-websocket-server/`)

| File | Role |
| --- | --- |
| `server.py` | FastAPI app — routes, lifespan, error handlers |
| `app_settings.py` | `AppSettings.from_env()` — environment binding |
| `aioca_api.py` | Thin adapter over aioca (read once, type resolution) |
| `api_contract.py` | Pydantic models — `DetailLevel`, `DatatypeAlias`, `ReadRequestOptions`, `StatsResponse`, `validate_pv_name` |
| `pv_serialization.py` | `build_pv_response`, `generic_error_payload` — uniform envelope across REST + WS |
| `websocket_pv_manager.py` | Heart of the module: connection + subscription + monitor management |
| `root_docs_page.py` + `root_docs.md` | HTML landing page rendered at `GET /` |
| `stats_dashboard.py` | HTML dashboard at `/stats/ui` (live snapshot of `/stats`) |
| `logging_utils.py` | `configure_logging(level, json)` |
| `tests/` | pytest |

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/` | HTML landing page with quick links |
| `GET` | `/docs`, `/redoc` | OpenAPI (toggled by `ENABLE_DOCS`) |
| `GET` | `/pv/{pv_name}` | Typed read. Query params: `detail`, `datatype`, `count`, `timeout`. |
| `GET` | `/ws/pvs?auth=<jwt>` | WebSocket — connect, subscribe, snapshot, event, unsubscribe, ping/pong |
| `GET` | `/health/live`, `/health/ready` | Liveness / readiness |
| `GET` | `/stats` | JSON snapshot — connections, monitors, subscribers, cached values |
| `GET` | `/stats/ui` | HTML dashboard auto-refreshing from `/stats` |

## WebSocket dialect (richer than the mock)

The Python server's WS interface is a strict superset of the mock's surface — but uses a different frame contract:

```jsonc
// server → client on connect
{ "type": "connected", "operation": "monitor",
  "connection_id": "abc123def456",
  "limits": { "max_pvs_per_subscription": 64,
              "max_subscriptions_per_connection": 32 } }

// client → server
{ "type": "subscribe", "subscription_id": "main",
  "pvs": ["DEVICE:PV1", "DEVICE:PV2"],
  "detail": "time", "timeout": 2.0,
  "all_updates": false, "notify_disconnect": true }

// server → client (after subscribe)
{ "type": "subscribed", "operation": "monitor",
  "subscription_id": "main", "detail": "time",
  "pvs": ["DEVICE:PV1", "DEVICE:PV2"], "ok": true }

{ "type": "snapshot", "operation": "monitor",
  "subscription_id": "main", "pv": "DEVICE:PV1",
  "detail": "time", "ok": true, "value": 42.5, "metadata": {} }

{ "type": "event", ... }   // live updates

{ "type": "unsubscribe", "subscription_id": "main" }
{ "type": "ping", "nonce": "123" }
```

The mock backend speaks a simpler frame shape (`pvs` as object, single `pv` frame type). The frontend client currently emits the mock dialect — see [websocket-protocol](websocket-protocol.md) and [ADR-0009](../adr/0009-shared-ws-protocol-contract.md) for the gap.

## Read endpoint

```bash
curl "http://localhost:8080/pv/DEVICE:PV?detail=control&timeout=2.5"
```

`detail`: `value` | `time` | `control`
`datatype`: `native` | `string` | `integer` | `float` | `enum_string` | `char_string` | `char_bytes` | `char_unicode` | `class_name` | `stsack_string`
`count`: `0` (single), `-1` (waveform), or positive integer
`timeout`: bounded by server config

## Health & stats

`/stats` returns server readiness, active WS count, shared monitor count, subscription totals, per-connection PV lists, per-monitor subscriber lists, cached last values. `/stats/ui` is the dashboard.

## Configuration

| Env var | Default | Notes |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | |
| `PORT` | (per Makefile) | |
| `LOG_LEVEL` | `INFO` | |
| `LOG_JSON` | `false` | |
| `DEFAULT_TIMEOUT` | 2.0 s | aioca read default |
| `MAX_TIMEOUT` | 30 s | upper bound on per-request timeout |
| `MAX_PVS_PER_SUBSCRIPTION` | 64 | |
| `MAX_SUBSCRIPTIONS_PER_CONNECTION` | 32 | |
| `ENABLE_DOCS` | true | gates `/docs` and `/redoc` |

See [reference/env-vars](../reference/env-vars.md) for the consolidated table.

## What's not here yet

- **No write endpoint.** Writes are out of scope for the current Python server. The mock's `POST /pv/<NAME>` has no counterpart. Cross-reference: [pv-write-endpoint](pv-write-endpoint.md), [ADR-0004](../adr/0004-single-pv-write-endpoint.md).

## Running

See [running-python-backend](../runbooks/running-python-backend.md) and [deploying-python-backend](../runbooks/deploying-python-backend.md).

## Source-of-truth README

[`backend/python-websocket-server/README.md`](../../backend/python-websocket-server/README.md).
