# Backend overview

Two backend **modules**, one nominal **interface** (the WebSocket pub/sub pattern at `/ws/pvs`). The frontend doesn't know which is on the other end.

## The two adapters

| Module | Path | Language | Role | Port |
| --- | --- | --- | --- | --- |
| Mock | `backend/mockup-websocket-server/` | Go (Echo + Gorilla) | Dev/test — synthesises PV values from name prefixes | 8080 |
| Python | `backend/python-websocket-server/` | Python (FastAPI + aioca) | Production — proxies a real EPICS network | (configurable) |

Two adapters on the same nominal seam → this is a **real seam**, not hypothetical. Each adapter has its own page:

- [Mock server (Go)](mock-server.md)
- [Python server (FastAPI + aioca)](python-server.md)

## What's actually shared

| Capability | Mock | Python |
| --- | --- | --- |
| `GET /ws/pvs` accepts `?auth=<jwt>` | ✓ | ✓ |
| Reads (subscribe → push) | ✓ | ✓ (richer dialect) |
| Writes via `POST /pv/<NAME>` | ✓ | ✗ (read/monitor only — see [its README](../../backend/python-websocket-server/README.md)) |
| Synthetic value drift | ✓ | n/a (real PVs) |
| REST-side helpers (`/pv/:n/:v`, `/mode/:p/:v`) | ✓ | n/a |
| Health / stats endpoints | ✗ | ✓ (`/health/{live,ready}`, `/stats`, `/stats/ui`) |

The two big gaps — wire-frame divergence and write-side asymmetry — are documented in [websocket-protocol](websocket-protocol.md), [pv-write-endpoint](pv-write-endpoint.md), and [ADR-0009](../adr/0009-shared-ws-protocol-contract.md).

## Mock-vs-Python split — why both exist

Recorded in [ADR-0005](../adr/0005-mock-vs-python-backend-split.md). Short version: the mock decouples frontend development from EPICS availability, and the prefix-based synthesis (`AI_*` float / `BI_*` bool / `SI_*` string) gives every page deterministic, type-correct test data without an EPICS database. The Python server is the production endpoint that talks to actual hardware.

## Running them

- [Running the mock backend](../runbooks/running-mock-backend.md)
- [Running the Python backend](../runbooks/running-python-backend.md)
- [Deploying the Python backend](../runbooks/deploying-python-backend.md)

## Auth on the wire

Both backends require `?auth=<jwt>` on the WS upgrade. The token is a NextAuth JWT — see [auth](../frontend/auth.md).
