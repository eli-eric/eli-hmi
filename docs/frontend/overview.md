# Frontend overview

Next.js 16 / React 19 / TypeScript under `frontend/`. App Router. Turbopack dev server on **port 8082** (not 3000).

## What the frontend is

A control-system HMI rendered in the browser, run from operator stations. The audience for *new pages* is control-system engineers — not React specialists. Pages are composed from a typed [ModuleConfig](module-pages.md) plus a small set of [compound HMI components](hmi-components.md). The frontend doesn't know which backend is on the other end of the WebSocket; see [architecture](../architecture.md).

## Top-level **modules** inside `frontend/src/`

| Path | Role |
| --- | --- |
| `app/` | Routes (App Router), providers, layouts. |
| `app/(modules)/<m>-controls/` | One route per control module: a dynamic server entry loads mounted YAML and a colocated client view composes `<ModuleControlPage>`. |
| `app/(modules)/l4-opcpa/` | Exception: custom shell, custom PV registry. [Detail.](l4-opcpa.md) |
| `app/providers/` | `WebSocketProvider`, session provider, theme. |
| `components/hmi/` | Compound HMI components: `VolumePanel`, `ConnectorLine`, `LaserPanel`, `StatusBar`, `controls/`. [Detail.](hmi-components.md) |
| `components/module-page/` | `<ModuleControlPage>` shell + 5 config-driven panels. |
| `components/navigation/` `components/ui/` | Nav bar, generic primitives. |
| `lib/websocket/` | WS client adapter — `useWebSocket`, `useWebSocketData`, `PVDisplay`, `WebSocketProvider`. [Detail.](websocket-client.md) |
| `lib/settings/` | Runtime zone schema, YAML loader, and route helpers. [Detail.](zones.md) |
| `lib/runtime-config/` | Client context populated by `/api/runtime-config`. |
| `lib/modules/` | `ModuleConfig` schema/types + mounted-YAML loader. [Detail.](module-pages.md) |
| `lib/server/auth/` | NextAuth + LDAP. [Detail.](auth.md) |
| `lib/utils/pv-helpers.ts` | `getPrefixedPV`, `getFormattedValue`. [Detail.](../reference/pv-naming.md) |
| `lib/api/pvs.ts` | `pvWrite()` — the single PV-write adapter onto `POST /pv/<NAME>`. |
| `test/` | Vitest setup + two WS test seams (`ws-mock-server.ts`, `ws-test-provider.tsx`). |
| `proxy.ts` | Next.js 16 Proxy: zone + auth gate. |

## Conventions

| Topic | Rule |
| --- | --- |
| Path alias | `@/` → `frontend/src/` |
| Filenames | kebab-case for non-component modules; PascalCase permitted for files whose export is a single React component matching the filename. Don't mix within a directory. |
| Style | Prettier: no semicolons, single quotes. |
| Client components | Declare `'use client'`. |
| CSS | CSS Modules with kebab-case class names; variants via `styles[\`name-${variant}\`]`. |
| Theme | Use tokens from `src/app/globals.css` (`--color-*`, `--shadow-*`, `--border-radius-*`). |
| Commit subjects | Short imperative; prefix Jira/issue id if present (`OPHMI-15: …`). |

Detail: [`frontend/AGENTS.md`](../../frontend/AGENTS.md).

## Test seams

- `mockWebSocketServer()` (`src/test/ws-mock-server.ts`) — replaces `globalThis.WebSocket`. Use for connection-lifecycle and integration tests. Honours the on-wire frame contract.
- `<TestWebSocketProvider value={fakeContext}>` (`src/test/ws-test-provider.tsx`) — short-circuits the connection layer for fast component tests.

The split is itself an example of *adapter vs implementation*: same interface (`WebSocketContext`), two implementations, used as **adapters** at the test seam.

## Coverage gate

`.gitlab-ci.yml` `frontend-test` enforces 70/70/70/60 over TypeScript sources
in `src/lib/websocket/**`, `src/lib/settings/**`, `src/lib/modules/**`,
`src/proxy.ts`, and `src/components/module-page/**` (the parts most expensive
to break).
