# Mock server (Go)

`backend/mockup-websocket-server/`. Echo + Gorilla. One binary, no storage, no external deps. Use for local dev and frontend integration tests.

## What it is

A simulator. Each unique PV mentioned by any client spawns one `pvSim` goroutine that owns the value and a subscriber set. A ticker (~300–400 ms) broadcasts the current value to subscribers and, unless the prefix is in manual-only mode, drifts the value. When the last subscriber for a PV disconnects, the simulator shuts down.

The value type is inferred from the **PV-name prefix**:

| Prefix | Value type | Notes |
| --- | --- | --- |
| `AI_*` | `float64` | Auto-drift in normal mode |
| `BI_*` | `bool` | Default mode is *manual* (`biMode=2`) — bool drift would be noise |
| `SI_*` | `string` | Default mode is *manual* (`siMode=2`); cycles through preset words |
| `CMD_*` | (command) | L4 OPCPA additions — see below |

These are mock-only conventions; the real EPICS network does not use them. See [pv-naming](../reference/pv-naming.md).

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/ws/pvs?auth=<jwt>` | WebSocket subscribe / unsubscribe / set |
| `POST` | `/pv/:name` | **Primary write endpoint** (L4 OPCPA). Body: `{"value": ...}`. Auth header required. |
| `PUT` | `/pv/:name` | Realistic write contract used by frontend `WarningErrorControl` / `DropDownStateControl`. |
| `GET` | `/pv/:name/:value` | REST side-door — set any PV from a URL (developer convenience). |
| `GET` | `/mode/:prefix/:value` | Toggle a prefix between auto-simulate (`1`) and manual (`2`). |
| `GET` | `/mode/fail-rate/:n` | L4 OPCPA: percentage of writes that should fail. `0` disables. Default 10. |
| `GET` | `/waveforms` | L4 OPCPA: list available waveform names for `WaveformSelect`. |

## WS frame contract

```jsonc
// client → server
{ "type": "subscribe",   "pvs": { "AI_TEMP": true } }
{ "type": "unsubscribe", "pvs": { "BI_DOOR": true } }
{ "type": "set",         "pvs": { "BI_DOOR": true, "AI_MOTOR_POS_X": 42.5 } }

// server → client (one frame per PV)
{ "type": "pv", "name": "AI_TEMP", "value": 42.5,
  "severity": 0, "ok": true, "timestamp": 1746000001.7, "units": "°C",
  "error": "" }
```

Detail and rationale in [websocket-protocol](websocket-protocol.md).

## L4 OPCPA extensions

The mock hand-mirrors the [L4 OPCPA PV-name registry](../../frontend/src/app/(modules)/l4-opcpa/lib/pv-names.ts) in `l4_opcpa.go`. A header comment in that file points back to `pv-names.ts` as the canonical source. **Keep them in sync.** See [ADR-0006](../adr/0006-pv-name-registry-l4-opcpa.md).

Effect chains: command PVs (`CMD_<L>_<NAME>`) trigger coordinated writes across 25+ effect PVs. The simulator holds each effect's value for 3 s before releasing it back to drift.

10 % failure injection on writes is **off by default**. Enable for demos:

```bash
curl http://localhost:8080/mode/fail-rate/10
```

## Tuning constants

Top of `main.go`:

```go
var (
    aiMode = 1            // 1 = autosimulate, 2 = manual
    biMode = 2
    siMode = 2
    updatePeriodMs = 300
    randomWords = []string{ "High Vacuum Pumping", "High Vacuum", ... }
)
```

Edit + `go run main.go` to see the effect.

## Running

See [running-mock-backend](../runbooks/running-mock-backend.md).

## Source-of-truth README

[`backend/mockup-websocket-server/readme.md`](../../backend/mockup-websocket-server/readme.md).
