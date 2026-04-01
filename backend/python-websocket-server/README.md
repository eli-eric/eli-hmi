# EPICS WebSocket Server

This service exposes a production-oriented FastAPI gateway in front of EPICS using aioca. The current scope is read and monitor operations only.

## HTTP API

`GET /pv/{pv_name}` returns a stable envelope with the selected detail level.

Example:

```bash
curl "http://localhost:8080/pv/DEVICE:PV?detail=control&timeout=2.5"
```

Supported query parameters:

- `detail`: `value`, `time`, `control`
- `datatype`: `native`, `string`, `integer`, `float`, `enum_string`, `char_string`, `char_bytes`, `char_unicode`, `class_name`, `stsack_string`
- `count`: `0`, `-1`, or a positive integer
- `timeout`: bounded by server configuration

## WebSocket API

Connect to `ws://localhost:8080/ws/pvs`.

Subscribe example:

```json
{
  "type": "subscribe",
  "subscription_id": "main",
  "pvs": ["DEVICE:PV1", "DEVICE:PV2"],
  "detail": "time",
  "timeout": 2.0,
  "all_updates": false,
  "notify_disconnect": true
}
```

Unsubscribe example:

```json
{
  "type": "unsubscribe",
  "subscription_id": "main"
}
```

Ping example:

```json
{
  "type": "ping",
  "nonce": "123"
}
```

The server emits `connected`, `subscribed`, `snapshot`, `event`, `unsubscribed`, `pong`, and `error` messages.

## Health Endpoints

- `GET /health/live`
- `GET /health/ready`

## Diagnostics Endpoint

- `GET /stats`
- `GET /stats/ui`

These endpoints are intended for internal diagnostics.

`GET /stats` returns a point-in-time JSON snapshot of:

- server readiness
- active websocket connection count
- active shared monitor count
- total client subscription count
- total subscriber references across all monitors
- per-connection subscriptions and requested PVs
- per-monitor subscriber lists and the cached last value when one is available

`GET /stats/ui` serves a simple responsive HTML dashboard from the API process itself and refreshes its data from `GET /stats`.

Because the response is a live snapshot, the data can change immediately after the response is generated.

## Configuration

Environment variables:

- `HOST`
- `PORT`
- `LOG_LEVEL`
- `LOG_JSON`
- `DEFAULT_TIMEOUT`
- `MAX_TIMEOUT`
- `MAX_PVS_PER_SUBSCRIPTION`
- `MAX_SUBSCRIPTIONS_PER_CONNECTION`
- `ENABLE_DOCS`

## Local Run

```bash
make install
make dev
```

Production-style local run:

```bash
make run
```

## Docker

```bash
make docker-build
make docker-run
```

The container entrypoint uses `fastapi run server.py`, which is enough here because `fastapi-cli` already provides the production ASGI server integration.

If you need different bind settings, override them on the command line, for example `make dev HOST=127.0.0.1 PORT=8090`.
