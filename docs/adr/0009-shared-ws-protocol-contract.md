# ADR-0009: Shared WebSocket protocol contract

**Status:** Open
**Date:** 2026-05-13
**Deciders:** ELI-HMI team

## Context

The two backend adapters at the `/ws/pvs` **seam** do not satisfy the same frame contract. Detail in [backend/websocket-protocol](../backend/websocket-protocol.md).

| Aspect | Mock (Go) | Python (FastAPI) | Frontend client |
| --- | --- | --- | --- |
| `pvs` shape on subscribe | object `{NAME:true}` | array `[NAME]` | object `{NAME:true}` |
| `subscription_id` | absent | required | absent |
| Initial value frame | normal `pv` | dedicated `snapshot` | parses `pv` only |
| Updates | `pv` | `event` | parses `pv` only |
| Connection ack | none | `connected` (with limits) | ignored |

In practice, the frontend works against the mock and does not work against the Python server. The Python server is the **production target** ([ADR-0005](0005-mock-vs-python-backend-split.md)), so this is a real ship blocker.

## Decision

**Not yet decided.** This ADR exists to (1) freeze the gap as an explicit architectural debt, (2) prevent ad-hoc shimming during unrelated changes, and (3) name the three options.

Options:

1. **Adopt the Python dialect on the frontend** (and emulate it in the mock).
   Highest leverage long-term — the Python server's richer surface (`subscription_id`, separate `snapshot`/`event`, `connected` limits, ping/pong) is genuinely useful. Biggest one-time change.
2. **Add a compatibility shim to the Python server.**
   Easiest to land. Pushes the dialect-translation complexity into the server, which is the wrong direction — the server learns the dialects of its clients.
3. **Define a third, deliberate contract** and migrate both adapters.
   Best vocabulary; most coordination. Right answer if the team takes this seriously enough to write it down once.

This ADR will be updated to *Accepted* once an option is chosen. Until then, do not silently expand the divergence — every new WS frame change on either side must be reflected in the matching adapter or in [backend/websocket-protocol](../backend/websocket-protocol.md).

## Consequences

- **Positive (when accepted).** A single named contract makes the seam testable end-to-end across both adapters.
- **Negative (status quo).** The frontend cannot consume the Python server, so production deployment is gated on resolving this.
- **Open — the whole point.** Pick option 1, 2, or 3.

## Alternatives considered

(Same as the three options above; this ADR is the meta-decision to *decide*, not the decision itself.)
