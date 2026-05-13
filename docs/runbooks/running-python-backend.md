# Running the Python backend

FastAPI + aioca. Read/monitor only at present (no write endpoint).

## Quick run (Makefile)

```bash
cd backend/python-websocket-server
make install         # creates .venv, installs requirements
make dev             # fastapi dev server.py --host 127.0.0.1 --port 8000
```

Production-style local run (no auto-reload):

```bash
make run
```

Override host/port:

```bash
make dev HOST=127.0.0.1 PORT=8090
```

## Direct invocation

```bash
source .venv/bin/activate
fastapi dev server.py --host 127.0.0.1 --port 8000
# or, prod-style:
fastapi run server.py --host 127.0.0.1 --port 8000
```

## Docker

```bash
make docker-build           # tag: eli-hmi-epics-gateway
make docker-run             # maps $(PORT):8080
```

The container entrypoint runs `fastapi run server.py` on internal port 8080.

## EPICS environment

aioca needs to find your IOCs. Standard EPICS env vars:

```
EPICS_CA_ADDR_LIST=10.78.0.50 10.78.0.51
EPICS_CA_AUTO_ADDR_LIST=NO
EPICS_CA_SERVER_PORT=5064
```

Without these, reads will time out and `/health/ready` will report `starting` indefinitely.

## Verify

```bash
# Landing page (HTML)
curl http://localhost:8000/

# Health
curl http://localhost:8000/health/live
curl http://localhost:8000/health/ready

# Read a PV
curl "http://localhost:8000/pv/DEVICE:PV?detail=control&timeout=2.5"

# Stats
curl http://localhost:8000/stats          # JSON
open  http://localhost:8000/stats/ui      # HTML dashboard
```

## Connecting the frontend (with caveats)

The frontend currently emits the [mock dialect](../backend/websocket-protocol.md). Pointing `NEXT_PUBLIC_API_URL` at this server's host:port will fail until [ADR-0009](../adr/0009-shared-ws-protocol-contract.md) resolves the protocol gap.

For read-only verification, hit `GET /pv/<name>` directly from `curl` or the OpenAPI UI at `/docs`.

## Stopping

Ctrl-C in dev. For Docker: `docker stop <container>`.

## Source-of-truth README

[`backend/python-websocket-server/README.md`](../../backend/python-websocket-server/README.md).
