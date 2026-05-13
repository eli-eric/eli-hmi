# Auth

NextAuth Credentials provider → server-side LDAP bind → JWT. The JWT is the access token carried on every cross-module hop.

## Flow

1. Operator submits username + password to the NextAuth credentials route.
2. `src/lib/server/auth/ldap-auth.ts` does the LDAP bind:
   - Production: `LDAP_SERVER_URL` (e.g. `ldap://10.78.0.11`), `LDAP_BASE_DN=dc=lcs,dc=local`.
   - Dev bypass: `test` / `test` — same file, short-circuits to a fake user when both fields are exactly `test`.
3. On success, NextAuth issues a JWT. `session.accessToken` is the token the rest of the app uses.

## Three places the token travels

| Carrier | Mechanism | Code |
| --- | --- | --- |
| Browser → frontend SSR | NextAuth session cookie | NextAuth managed |
| Frontend → WS backend | `?auth=<token>` query parameter on the `/ws/pvs` URL | `useWebSocket` (`src/lib/websocket/use-websocket.ts`) |
| Frontend → PV-write backend | `Authorization: Bearer <token>` header on `POST /pv/<NAME>` | `pvWrite()` (`src/lib/api/pvs.ts`) |

Both backends verify the token.

## Required env

```
NEXTAUTH_SECRET=<strong random>
LDAP_SERVER_URL=ldap://10.78.0.11
LDAP_BASE_DN=dc=lcs,dc=local
# Optional
LDAP_USE_TLS=true
```

See [reference/env-vars](../reference/env-vars.md) for the full list.

## Dev login

Username `test`, password `test`. The bypass is in `ldap-auth.ts` and is gated by the literal-string match — it doesn't depend on `NODE_ENV`, so don't ship a build that has the bypass active by mistake. See [`frontend/src/lib/server/auth/README.md`](../../frontend/src/lib/server/auth/README.md) for the production wiring.

## Why the query param (not a header) for WebSocket

Browsers cannot attach `Authorization` headers to a `WebSocket` upgrade request. The token is sent as `?auth=<token>` on the URL and validated server-side. Connection state is fully authenticated for the lifetime of the socket — there is no per-frame auth.

This decision lives in [ADR-0001](../adr/0001-ws-pubsub-pattern.md).
