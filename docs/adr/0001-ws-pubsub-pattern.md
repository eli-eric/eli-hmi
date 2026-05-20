# ADR-0001: WebSocket pub/sub for EPICS PVs

**Status:** Accepted
**Date:** 2025-04-30
**Deciders:** ELI-HMI team

## Context

The HMI needs live PV values from EPICS in a browser. Three options were on the table:

1. Polling HTTP GETs per PV
2. EPICS Channel Access directly from the browser (not viable — no JS CA client)
3. A backend that proxies CA into a single browser-facing WebSocket

Operator pages subscribe to dozens of PVs. Polling would explode the request count and either lag (long intervals) or hammer the backend (short intervals). EPICS pushes its own updates already; we want to surface them, not re-discover them.

## Decision

A single app-wide WebSocket connection per browser tab. The frontend WS client (`useWebSocket` + `useWebSocketContext`) is a deep **module** behind one **interface** (`useWebSocketData(pv|{pvs:[]})`). Subscriptions are stored in a ref-backed map and replayed on every reconnect via `replaySubscriptions()`. The NextAuth JWT is carried as `?auth=<token>` on the upgrade URL — browsers cannot attach an `Authorization` header to a WebSocket upgrade.

The backend side has two **adapters** at this **seam**: the Go mock and the Python FastAPI server. Two adapters means the seam is real, not hypothetical.

## Consequences

- **Positive — leverage.** One pattern fits every PV consumer. Reconnect, replay, dedup, prefix mapping, and typed envelopes live in one place.
- **Positive — locality.** All connection-lifecycle bugs concentrate in `useWebSocket`. The test surface is the hook's interface.
- **Negative.** Browsers can't carry auth in headers on WS upgrade, so the JWT is on the URL. URL-borne tokens leak into server logs unless logs are scrubbed; verify your log pipeline.
- **Open.** The two adapters do not currently satisfy the same frame contract — see [ADR-0009](0009-shared-ws-protocol-contract.md).

## Alternatives considered

- **Per-page WS connections.** Rejected — N pages × M PVs × reconnect = N×M reconnect storms; defeats the dedup leverage.
- **Server-Sent Events.** No client→server channel without a parallel HTTP request, so subscribe/unsubscribe lifecycles become awkward.
- **GraphQL subscriptions.** Same shape via a heavier transport; the EPICS payload is too simple to justify a typed query layer.
