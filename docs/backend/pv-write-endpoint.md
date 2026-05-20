# PV write endpoint

A single HTTP endpoint that writes one PV. The contract:

```http
POST /pv/<NAME>
Authorization: Bearer <jwt>
Content-Type: application/json

{ "value": <typed value> }
```

Response: 200 with `{ "ok": true }` on success; 4xx/5xx with `{ "ok": false, "error": "..." }` on failure.

## Why one endpoint, not many

See [ADR-0004](../adr/0004-single-pv-write-endpoint.md). Two relevant properties:

- **Locality.** Every UI action that mutates state — a button, a dropdown, a chip preset, a CMD trigger — goes through the same endpoint and the same client-side hook (`usePvWrite` / `pvWrite()`). Audit, retry, logging, auth, and error UX live in one place.
- **Leverage.** New control panels don't grow new endpoints. Adding a button on the frontend equals adding a row in the mock's `l4_opcpa.go` value table. Two integrations, no API surface change.

## Adapters

| Backend | Honors `POST /pv/<NAME>`? |
| --- | --- |
| Mock | ✓ (`writePvHandler` in `main.go`) |
| Python | ✗ (read/monitor only today — see [its README](../../backend/python-websocket-server/README.md)) |

The mock is the only adapter that implements the write seam. The Python server has not yet grown a write path — when it does, it must honor this contract (or [ADR-0004](../adr/0004-single-pv-write-endpoint.md) must be revisited).

## Command PVs

Some writes hide effect chains. On the mock, writing to `CMD_<L>_<NAME>` triggers 25+ downstream PV writes (e.g. `CMD_NL2_START_LASER`). The frontend treats CMD PVs as fire-and-forget triggers — same write contract, server-side dispatch. See [l4-opcpa](../frontend/l4-opcpa.md#write-path).

## Failure injection (mock)

```bash
curl http://localhost:8080/mode/fail-rate/10   # 10 % of writes fail
curl http://localhost:8080/mode/fail-rate/0    # disable
```

Default rate is 0. The L4 demo workflow flips it to 10 % to exercise frontend error UI.

## Frontend call sites

| Path | Caller |
| --- | --- |
| `src/lib/api/pvs.ts` → `pvWrite()` | The single write adapter. Every control consumes `usePvWrite()` which calls `pvWrite()`. |
| `src/components/hmi/volume-panel/components/WarningErrorControl.tsx` | Direct `fetch()` + `getPrefixedPV()` — predates `pvWrite()`. |
| `src/components/hmi/volume-panel/components/internal/DropDownStateControl.tsx` | Same as above. |

The two direct call sites should migrate to `pvWrite()` so that `getPrefixedPV` has zero write-side call sites — see the [context](../context.md#what-good-deepening-looks-like-here) for why.

## Auth

The `Authorization: Bearer <jwt>` header is required. The token is the same NextAuth JWT used on the WebSocket — see [auth](../frontend/auth.md).
