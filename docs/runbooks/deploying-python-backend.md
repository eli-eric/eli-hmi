# Deploying the Python backend

Production target. Runs as a Docker container pushed to the ELI Harbor registry. The frontend production image is built by a separate CI job; this runbook only covers the Python backend.

## Pipeline

`.gitlab-ci.yml` job `docker-build-job-python` does:

1. `docker pull harbor.eli-beams.eu/proxy-dockerhub/python:3.12.1` so the build does not depend on a cold base-image fetch.
2. `docker build -t ${HARBOR_HOST}/${HARBOR_PROJECT}/eli-hmi-backend-python:${CI_COMMIT_REF_SLUG} backend/python-websocket-server`.
3. `docker login` to `harbor.eli-beams.eu` with `${HARBOR_USERNAME}` / `${HARBOR_PASSWORD}`.
4. `docker push` of `${CI_COMMIT_REF_SLUG}`.
5. `docker tag` to `${HARBOR_HOST}/${HARBOR_PROJECT}/eli-hmi-backend-python:latest`.
6. `docker push` of `:latest`.

The production frontend image is published by `docker-build-job-frontend` and follows the same `${CI_COMMIT_REF_SLUG}` plus `latest` tag flow.

## What the container expects

| Var                                                            | Effect                                                                                                   |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `HOST` / `PORT`                                                | Bind. Container exposes 8080 internally; map externally as needed.                                       |
| `EPICS_CA_ADDR_LIST` / `EPICS_CA_AUTO_ADDR_LIST`               | Where aioca looks for IOCs. **Without these, reads time out and `/health/ready` never reports `ready`.** |
| `LOG_LEVEL`, `LOG_JSON`                                        | Logging. JSON logs are friendlier for the production log pipeline.                                       |
| `DEFAULT_TIMEOUT`, `MAX_TIMEOUT`                               | aioca read timeouts. Tune to the slowest IOC you talk to.                                                |
| `MAX_PVS_PER_SUBSCRIPTION`, `MAX_SUBSCRIPTIONS_PER_CONNECTION` | Soft limits, advertised in the `connected` frame.                                                        |
| `ENABLE_DOCS`                                                  | Set to `false` to disable `/docs` and `/redoc` in production.                                            |

See [reference/env-vars](../reference/env-vars.md) for defaults.

## Health checks for the orchestrator

| Endpoint            | Purpose                                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `GET /health/live`  | Liveness — the process is up. Return `{"status":"live"}`.                                                            |
| `GET /health/ready` | Readiness — the EPICS connection pool has initialised. Returns `{"status":"ready"}` once `ws_manager.ready` is true. |

If `ready` never flips, the most common cause is missing `EPICS_CA_ADDR_LIST` or unreachable IOCs.

## Stats / observability

- `GET /stats` — JSON. Connection count, monitor count, subscriber counts, per-monitor cached values.
- `GET /stats/ui` — HTML dashboard that polls `/stats`.

These are intended for internal diagnostics. If you front them behind a reverse proxy, gate them by IP or auth.

## Rollback

There's no published semantic version tag yet. CI publishes `${CI_COMMIT_REF_SLUG}` and `:latest`. If a rollback is needed:

1. Pull the previous SHA from the Harbor registry.
2. Re-tag it as `:latest` and push.
3. Restart the orchestrator pod/service so it picks up the new image.

This is brittle. A `vX.Y.Z` tagging policy is worth introducing — out of scope of this doc.

## Source-of-truth README

[`backend/python-websocket-server/README.md`](../../backend/python-websocket-server/README.md).
