# Frontend WebSocket client

The deep **module** that sits in front of every PV read in the app. One app-wide WS connection. Subscribers don't deal with the wire, reconnects, or prefix mapping.

## Interface

```ts
useWebSocketData(pv: string)              // → { data,  isConnected }
useWebSocketData({ pvs: string[] })       // → { byPv, state, isConnected }
```

The hook is the **interface**; callers pass *logical* PV names and get typed `Message<T>` envelopes back. Everything else is implementation detail.

```tsx
import { useWebSocketData } from '@/lib/websocket/use-websocket-data'
import { PVDisplay } from '@/lib/websocket/pv-display'

const Pressure = ({ pv }: { pv: string }) => {
  const { data, isConnected } = useWebSocketData<number>(pv)
  return <PVDisplay data={data} isConnected={isConnected} />
}
```

## What the hook hides

- **Connection lifecycle.** `useWebSocket` (`src/lib/websocket/use-websocket.ts`) owns the WebSocket. State is `connecting | connected | disconnected`.
- **NextAuth JWT.** `session.accessToken` is passed as `?auth=<token>` on the URL — both backends require it.
- **Reconnect.** Exponential backoff with jitter, capped at 30 s. `replaySubscriptions()` re-subscribes every channel on reopen.
- **Subscription dedup.** One wire-level subscription per PV regardless of how many React components ask for it.
- **PV-name prefix mapping.** `getPrefixedPV` is applied on subscribe *and* on lookup. Callers stay in logical names. See [pv-naming](../reference/pv-naming.md).
- **Typed message envelope.** `Message<T>` carries `value`, `severity`, `units`, `timestamp`, `ok`. `isConnected` plumbed alongside.

`PVDisplay` renders `Message<T>` with sensible loading / error / disconnected fallbacks (`formatValue`, `errorComponent`, `loadingComponent`, `onError`).

## Why this is a deep module

Apply the deletion test: take the hook away and each PV consumer has to acquire the session token, open a WebSocket, debounce reconnects, map prefixes, dedup subscriptions, parse frames, and reconcile state. That complexity reappears at every call site. The hook earns its keep — and is the right shape for the *interface = test surface* principle.

The two test adapters described in [overview](overview.md#test-seams) sit at the same seam.

## Wire frames (mock dialect)

```jsonc
// client → server
{ "type": "subscribe", "pvs": { "AI_TEMP": true, "BI_DOOR": true } }
{ "type": "unsubscribe", "pvs": { "BI_DOOR": true } }
{ "type": "set", "pvs": { "BI_DOOR": true } }

// server → client
{ "type": "pv", "name": "AI_TEMP", "value": 42.5,
  "severity": 0, "ok": true, "timestamp": 1746000001.7, "units": "°C" }
```

The Python backend speaks a richer dialect — see [websocket-protocol](../backend/websocket-protocol.md) and [ADR-0009](../adr/0009-shared-ws-protocol-contract.md).

## Write side

Reads go through the hook. **Writes do not** — they go through `pvWrite()` (`src/lib/api/pvs.ts`) onto `POST /pv/<NAME>`. Two direct call sites currently use `getPrefixedPV` at the write boundary: `WarningErrorControl.tsx` and `DropDownStateControl.tsx`. See [pv-write-endpoint](../backend/pv-write-endpoint.md).
