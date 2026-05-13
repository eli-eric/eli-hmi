# Running the mock backend

Single Go binary. No deps beyond `go.mod`. Listens on `:8080`.

## Quick run

```bash
cd backend/mockup-websocket-server
go run main.go
```

Or build once and run repeatedly:

```bash
go build
./eli-hmi-mockup-websocket-server
```

## Docker

```bash
docker build -t mockup-ws-gateway .
docker run -p 8080:8080 mockup-ws-gateway
```

## Endpoints summary

See [backend/mock-server](../backend/mock-server.md) for the full table. The ones you'll actually hit by hand:

```bash
# Set values (GET so you can hit it from a browser)
curl http://localhost:8080/pv/AI_TEMP/37.0
curl http://localhost:8080/pv/BI_DOOR/true

# Mode flips per prefix: 1 = auto-simulate, 2 = manual
curl http://localhost:8080/mode/AI/1
curl http://localhost:8080/mode/BI/2

# L4 OPCPA write-failure injection (0 disables; default in code is 0)
curl http://localhost:8080/mode/fail-rate/10

# Inspect the L4 OPCPA waveform catalog
curl http://localhost:8080/waveforms
```

## Tuning

Edit constants at the top of `main.go`:

```go
var (
    aiMode = 1            // 1 = auto-simulate, 2 = manual
    biMode = 2
    siMode = 2
    updatePeriodMs = 300  // broadcast period
    randomWords = []string{ ... }
)
```

Re-run `go run main.go` to pick up changes.

## L4 OPCPA seed data

`seedLaserPVs()` (called from `main()`) populates default at-rest values for all 5 lasers on startup. Effect-chain writes (via `CMD_*` PVs) hold for 3 s before releasing back to auto-simulated drift around the last-set value. The hand-mirrored PV registry lives in `l4_opcpa.go` — keep it in sync with `frontend/src/app/(modules)/l4-opcpa/lib/pv-names.ts`.

## Stopping

Ctrl-C. No persistent state to clean up.

## Source-of-truth README

[`backend/mockup-websocket-server/readme.md`](../../backend/mockup-websocket-server/readme.md).
