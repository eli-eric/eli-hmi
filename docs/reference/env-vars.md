# Env vars

Consolidated reference across the three modules. *Source of truth, not aspiration* — vars listed here are the ones the code reads today.

## Frontend (`frontend/.env.local`)

| Var | Required | Default | Used for |
| --- | --- | --- | --- |
| `NEXTAUTH_SECRET` | yes | — | NextAuth JWT signing |
| `NEXTAUTH_URL` | dev | `http://localhost:8080/api/auth` | NextAuth callback base — set per host |
| `NEXT_PUBLIC_API_URL` | yes | — | host:port for both `ws://<host>/ws/pvs` and `http://<host>/pv` (see `frontend/src/types/constants.ts`) |
| `NEXT_PUBLIC_ZONE_CODE` | yes | (empty zone = no routes) | Build-time zone selector — see [zones](../frontend/zones.md) |
| `LDAP_SERVER_URL` | prod | — | LDAP bind URL for the production auth path |
| `LDAP_BASE_DN` | prod | — | LDAP base DN |
| `LDAP_USE_TLS` | optional | `false` | Toggle StartTLS on the LDAP bind |
| `NODE_ENV` | optional | `development` | Standard Node env |

A template lives at `frontend/env.example`.

`NEXT_PUBLIC_*` is baked at build time. Changing them post-build requires a rebuild.

## Mock backend (Go)

No env vars. Tuning is via constants at the top of `main.go`:

```go
var (
    aiMode = 1            // 1 = auto-simulate, 2 = manual
    biMode = 2
    siMode = 2
    updatePeriodMs = 300
)
```

Edit + `go run main.go`. Listens on `:8080`.

## Python backend (FastAPI + aioca)

| Var | Default | Notes |
| --- | --- | --- |
| `HOST` | `127.0.0.1` (Makefile) / `0.0.0.0` (image) | Bind address |
| `PORT` | `8000` (Makefile) / `8080` (container internal) | Bind port |
| `LOG_LEVEL` | `INFO` | Standard log levels |
| `LOG_JSON` | `false` | Switch logs to JSON |
| `DEFAULT_TIMEOUT` | `2.0` | aioca read timeout in seconds |
| `MAX_TIMEOUT` | `30.0` | Upper bound on per-request timeout |
| `MAX_PVS_PER_SUBSCRIPTION` | `64` | Limit emitted in the `connected` frame |
| `MAX_SUBSCRIPTIONS_PER_CONNECTION` | `32` | Same |
| `ENABLE_DOCS` | `true` | Toggle `/docs` and `/redoc` |

Plus standard aioca-side EPICS env (`EPICS_CA_ADDR_LIST`, `EPICS_CA_AUTO_ADDR_LIST`, etc.) for talking to a real EPICS network.

Run with `make dev` (foreground reload) or `make run` (no reload). Docker entrypoint binds 8080 internally; the Makefile's `docker-run` target maps `$(PORT):8080`.

## Authoring guidelines

- Never commit secrets — use `.env.local` (frontend) or process-injected env (backends).
- `NEXT_PUBLIC_*` ends up in the browser bundle. Don't put anything sensitive there.
- New env vars should be added to: the relevant code path, the `env.example` template (frontend), this page, and the README of the affected module.
