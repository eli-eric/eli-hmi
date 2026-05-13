# ADR-0004: Single PV write endpoint

**Status:** Accepted
**Date:** 2025-09-01
**Deciders:** ELI-HMI team (L4 OPCPA workstream)

## Context

The L4 OPCPA work introduced dozens of write paths: start/stop laser, change attenuation, load waveform, toggle shutter, set chiller setpoint, …. Initial designs sketched per-action endpoints (`/laser/start`, `/laser/stop`, `/laser/shutter`). Two problems:

- **Surface growth.** Every new control on the page meant a new endpoint, a new handler on the backend, a new client function. Three modules to touch per button.
- **Cross-cutting concerns.** Auth, retry, audit, error UX, failure injection, telemetry — each repeated per endpoint.

## Decision

Every UI mutation is one HTTP shape: `POST /pv/<NAME>` with `{value: …}` and an `Authorization` header. Some PVs are "command PVs" (`CMD_<L>_<NAME>`) whose backend handler dispatches a coordinated effect chain (e.g. `start_laser` writes 25+ PVs). The frontend treats CMD PVs as fire-and-forget triggers — same write **interface**, server-side dispatch.

The client-side **adapter** is `pvWrite()` (`src/lib/api/pvs.ts`), consumed via the `usePvWrite()` hook by every write control.

## Consequences

- **Positive — leverage.** Adding a button on the frontend equals adding a row in the backend's PV table. No API surface change.
- **Positive — locality.** Audit, retry, logging, failure-injection, error toasts — all in `pvWrite` and `usePvWrite`.
- **Negative — coupling.** Effect-chain behaviour hides on the server. The frontend cannot anticipate what writing `CMD_<L>_START_LASER` will do beyond "trigger start." Acceptable because operators don't need to: the spec defines the chain semantics in [Confluence](https://eli-eric.atlassian.net/wiki/spaces/CS/pages/2333902150).
- **Open.** The Python backend has not yet implemented this endpoint — it is currently read/monitor only. When it does, it must honor this contract.
- **Open.** Two pre-existing call sites (`WarningErrorControl.tsx`, `DropDownStateControl.tsx`) bypass `pvWrite()` and call `fetch` + `getPrefixedPV` directly. They should migrate; tracked in [context.md](../context.md#what-good-deepening-looks-like-here).

## Alternatives considered

- **Per-action REST endpoints.** Rejected — surface growth.
- **GraphQL mutations.** Rejected — the action shape is trivial; a typed query layer is overkill.
- **WebSocket-only writes.** Rejected — HTTP gives free auth header handling and standard retry semantics; we already pay the WS cost for reads.
