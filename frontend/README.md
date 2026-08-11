# ELI Beamlines Control System GUI (frontend)

Next.js 16 / React 19 / TypeScript app for **control-system operators** and **control-system engineers** at ELI Beamlines.

The audience for new pages is engineers who may not know React. Pages are composed from a typed **module config** + a small set of **compound HMI components**.

## Quick start

Use **Node 22** (matches the Docker images and `.nvmrc`).

No `nvm`? Install it (see [nvm-sh/nvm](https://github.com/nvm-sh/nvm#installing-and-updating)), then `nvm install 22`:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# reopen the terminal, then:
nvm install 22
```

```bash
nvm use                                    # Node 22, per .nvmrc
cp env.example .env.local                  # set NEXTAUTH_SECRET, API_URL, ZONE_CODE
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
API_URL=localhost:8080
ZONE_CODE=test                              # see "Zone configuration" below
# CONFIG_DIR=../eli-hmi-config              # optional in dev; containers use /app/zone-config
LDAP_SERVER_URL=ldap://10.78.0.11           # only used in prod auth
LDAP_BASE_DN=dc=lcs,dc=local
```

`env.example` carries a template.

## Adding a control module

See [`src/lib/modules/README.md`](src/lib/modules/README.md). TL;DR:

1. Add `modules/<m>/config.yaml` to the config directory and register its
   module key/route in the app's supported-module maps.
2. Add bespoke `parts/` (volumes + connectors) under `src/app/(modules)/<m>-controls/`.
3. Add a tiny dynamic server page that loads the config and a client view that
   renders the existing JSX:

   ```tsx
   import { loadModuleConfig } from '@/lib/modules/module-config-loader'
   import { MyModuleView } from './my-module-view'

   export const dynamic = 'force-dynamic'

   export default function MyModulePage() {
     return <MyModuleView config={loadModuleConfig('my-module')} />
   }
   ```

4. Add `modules.<m>.config` plus the route/nav entry to the relevant zone
   file(s) (`eli-hmi-config/zones/*.yaml`; see "Zone configuration" below).

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

## Zone configuration (CSI-861)

Per-environment config — navigation, allowed routes, L4 OPCPA laser data, and
p3/l3bt/l4fbt `ModuleConfig` data — lives **outside the app build** in a
zone-config directory ([ADR-0011](../docs/adr/0011-runtime-zone-config.md)):

- `ZONE_CODE` picks the zone at **runtime**; a code is valid exactly when `zones/<ZONE_CODE>.yaml` exists in the config dir — **no zone list in the code**.
- `CONFIG_DIR` points at the directory. Deployments mount a config checkout
  read-only (currently based on the in-repo template; a standalone
  controls-team repo is a follow-up; see
  `deployments/zones/testz/docker-compose.yml`). In development it defaults to
  [`../eli-hmi-config`](../eli-hmi-config/README.md), which documents the full
  file format.
- Config is read at server start and cached — **config change = restart the container**, never a rebuild. A broken/missing config **stops the container at startup** with a readable log message (`src/instrumentation.ts`). Per-request zone lookup failures degrade to `/no-access`; a module-file failure after startup surfaces as a page error.
- The Next.js 16 Proxy (`src/proxy.ts`, Node runtime) gates routes via `src/lib/settings/zone-service.ts`; the client nav receives `navigationItems`/`homeRoute` from `/api/runtime-config` via `useRuntimeConfig()`.
- Validate a config dir before deploy: `npm run validate:config -- --dir <path> --all`. Editor schemas are generated by `npm run gen:schema` (drift-tested).

The vacuum pages' data-only `ModuleConfig` fields are runtime YAML. Their
bespoke volume/connector `parts/` remain compiled TSX by design.

To bring up a new site: add `zones/<site>.yaml` to the config repo, set `ZONE_CODE=<site>` + the mount in that site's `docker-compose.yml` — CI ships one global image.

## Testing

```bash
npm test                  # watch
npm run test:run          # one-shot
npm run test:coverage     # CI gate (70/70/70/60 on websocket/settings/modules, proxy, module-page)
```

Two WebSocket test seams:
- `mockWebSocketServer()` (`src/test/ws-mock-server.ts`) — replaces `globalThis.WebSocket`. Use for connection-lifecycle and integration tests. Honors the real wire protocol.
- `<TestWebSocketProvider value={fakeContext}>` (`src/test/ws-test-provider.tsx`) — short-circuits the connection layer for fast component tests.

## Project structure (highlights)

```
src/
  app/                                 Next.js App Router (routes, providers, layouts)
    (modules)/<m>-controls/page.tsx    dynamic server config loader
    (modules)/<m>-controls/*-view.tsx  client ModuleControlPage composition
    (modules)/<m>-controls/parts/      bespoke volumes + connectors
  components/
    hmi/                               VolumePanel, ConnectorLine, StatusBar (compound components)
    module-page/                       ModuleControlPage shell + 5 config-driven panels
    navigation/                        top nav bar
    ui/                                generic primitives (buttons, icons, dropdown, tooltip, heading)
  lib/
    modules/                           ModuleConfig schema/types + runtime loader
    settings/                          zone schema + runtime loader + helpers
    server/auth/                       NextAuth + LDAP
    utils/                             pv-helpers (getPrefixedPV, getFormattedValue)
    websocket/                         useWebSocket, useWebSocketData, WebSocketProvider, PVDisplay, debug
  test/                                Vitest setup + the two WS test adapters
  proxy.ts                             zone + auth gate
```

## Where to ask

If you're stuck on a missing component or unexpected WebSocket behavior, contact the support team with: the component/feature, the error, and reproduction steps.
