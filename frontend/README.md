# ELI Beamlines Control System GUI (frontend)

Next.js 15 / React 19 / TypeScript app for **control-system operators** and **control-system engineers** at ELI Beamlines.

The audience for new pages is engineers who may not know React. Pages are composed from a typed **module config** + a small set of **compound HMI components**.

## Quick start

Use **Node 18** (matches the Docker image; pinned in `.nvmrc`). Newer Node (22+) ships an experimental server-side `localStorage` global that, if enabled via `NODE_OPTIONS`, breaks SSR with `localStorage.getItem is not a function`.

No `nvm`? Install it (see [nvm-sh/nvm](https://github.com/nvm-sh/nvm#installing-and-updating)), then `nvm install 18`:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# reopen the terminal, then:
nvm install 18
```

```bash
nvm use                                    # Node 18, per .nvmrc
cp env.example .env.local                  # set NEXTAUTH_SECRET, NEXT_PUBLIC_API_URL, NEXT_PUBLIC_ZONE_CODE
npm install
npm run dev                                # http://localhost:8082  (port 8082, not 3000)
```

In a second terminal, start the mock backend (otherwise the WebSocket layer reconnects forever):

```bash
cd ../backend/mockup-websocket-server && go run main.go      # :8080
```

Login `test` / `test` (LDAP bypass; see `src/lib/server/auth/ldap-auth.ts`).

## Environment variables

```env
NEXTAUTH_SECRET=...                         # any strong random value
NEXT_PUBLIC_API_URL=localhost:8080
NEXT_PUBLIC_ZONE_CODE=test                  # see "Zones in production" below
LDAP_SERVER_URL=ldap://10.78.0.11           # only used in prod auth
LDAP_BASE_DN=dc=lcs,dc=local
```

`env.example` carries a template.

## Adding a control module

See [`src/lib/modules/README.md`](src/lib/modules/README.md). TL;DR:

1. Drop a `<m>.config.ts` next to the others.
2. Add bespoke `parts/` (volumes + connectors) under `src/app/(modules)/<m>-controls/`.
3. The page is ~5 lines:

   ```tsx
   'use client'
   import { ModuleControlPage } from '@/components/module-page/module-control-page'
   import { myConfig } from '@/lib/modules/my.config'

   export default () => <ModuleControlPage config={myConfig} bottomRow={<MyVolumes />} />
   ```

4. Register the route in `src/lib/settings/zone-config.ts`.

## Reusable HMI components

Compound components for vacuum-system UIs live under `src/components/hmi/`:

- `VolumePanel` + `VolumePanel.{SensorBar, Pump, TurbopumpBasic, Locking, Doors, Config, MasterKey, Interlocks, MultiVolumes, Container, WarningErrorControl}`
- `ConnectorLine` + `ConnectorLine.{Line, Valve, Gate, GateConnected, LabelValue, ValveStatus, ValveControlStatus}`
- `StatusBar`

Engineers compose pages declaratively. State is managed inside the compound components — you wire PV names, not React state.

## WebSocket data

A single app-wide WebSocket connection is established by `useWebSocket` (`src/lib/websocket/use-websocket.ts`) and exposed via `WebSocketProvider` / `useWebSocketContext` (`src/app/providers/socket-provider.tsx`). The NextAuth JWT (`session.accessToken`) is sent as a `?auth=` query param. Reconnect uses exponential backoff with jitter.

Subscribe to PVs via `useWebSocketData` (`src/lib/websocket/use-websocket-data.ts`). One overloaded hook covers single and multi:

```tsx
import { useWebSocketData } from '@/lib/websocket/use-websocket-data'
import { PVDisplay } from '@/lib/websocket/pv-display'

// Single PV
const Pressure = ({ pv }: { pv: string }) => {
  const { data, isConnected } = useWebSocketData<number>(pv)
  return <PVDisplay data={data} isConnected={isConnected} />
}

// Multiple PVs
const Pump = ({ rpmPV, valvePV }: { rpmPV: string; valvePV: string }) => {
  const { byPv, isConnected } = useWebSocketData({ pvs: [rpmPV, valvePV] })
  return (
    <>
      <PVDisplay data={byPv(rpmPV)} isConnected={isConnected} />
      <PVDisplay data={byPv(valvePV)} isConnected={isConnected} />
    </>
  )
}
```

The hook **buries** the dev-vs-prod PV-name prefix mapping (`getPrefixedPV`). Pass logical names; the hook resolves them on subscribe and on lookup. The only direct `getPrefixedPV` call sites left are write-side `fetch()` calls.

`PVDisplay` renders `Message<T>` with sensible loading / error / disconnected fallbacks (with optional `formatValue`, `errorComponent`, `loadingComponent`, `onError`).

Wire protocol: client sends `{ type: 'subscribe', pvs: { NAME: true } }`; server pushes `{ type: 'pv', name, value, severity, units, timestamp, ok }`.

## Zones in production

`NEXT_PUBLIC_ZONE_CODE` selects a zone at **build time** from `src/lib/settings/zone-config.ts`. Each zone declares `navigationItems` and `allowedRoutes`. The middleware (`src/middleware.ts`) blocks unauthorized routes.

The shipped `production` zone is **intentionally empty**. To deploy:

1. **Recommended:** add a per-site zone (e.g. `e3`, `p3-hall`) with the routes the site operates, then build with `NEXT_PUBLIC_ZONE_CODE=p3-hall`. Use `docker build --build-arg`, a GitLab CI variable, or `.env.production`.
2. Alternatively, override the empty `production` entry in a fork or deploy-time patch of `zone-config.ts`.

`NEXT_PUBLIC_*` is baked at build time — switching zones means a rebuild. There is no runtime toggle.

## Testing

```bash
npm test                  # watch
npm run test:run          # one-shot
npm run test:coverage     # CI gate (70/70/70/60 on lib/websocket, lib/settings, middleware, module-page)
```

Two WebSocket test seams:
- `mockWebSocketServer()` (`src/test/ws-mock-server.ts`) — replaces `globalThis.WebSocket`. Use for connection-lifecycle and integration tests. Honors the real wire protocol.
- `<TestWebSocketProvider value={fakeContext}>` (`src/test/ws-test-provider.tsx`) — short-circuits the connection layer for fast component tests.

## Project structure (highlights)

```
src/
  app/                                 Next.js App Router (routes, providers, layouts, middleware)
    (modules)/<m>-controls/page.tsx    5-line config render
    (modules)/<m>-controls/parts/      bespoke volumes + connectors
  components/
    hmi/                               VolumePanel, ConnectorLine, StatusBar (compound components)
    module-page/                       ModuleControlPage shell + 5 config-driven panels
    navigation/                        top nav bar
    ui/                                generic primitives (buttons, icons, dropdown, tooltip, heading)
  lib/
    modules/                           ModuleConfig types + per-module configs
    settings/                          zone-config + helpers
    server/auth/                       NextAuth + LDAP
    utils/                             pv-helpers (getPrefixedPV, getFormattedValue)
    websocket/                         useWebSocket, useWebSocketData, WebSocketProvider, PVDisplay, debug
  test/                                Vitest setup + the two WS test adapters
  middleware.ts                        zone + auth gate
```

## Where to ask

If you're stuck on a missing component or unexpected WebSocket behavior, contact the support team with: the component/feature, the error, and reproduction steps.
