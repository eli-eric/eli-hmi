# ELI HMI EPICS Gateway

FastAPI gateway in front of EPICS using aioca. This service exposes read and monitor operations over HTTP and WebSockets.

## Quick Links

- [Swagger UI](/docs)
- [Stats Dashboard](/stats/ui)
- [Stats JSON](/stats)
- [Live Health](/health/live)
- [Ready Health](/health/ready)

`/docs` and `/redoc` depend on `ENABLE_DOCS` and may be disabled in some deployments.

## HTTP Read Endpoint

`GET /pv/{pv_name}` reads a single PV value with optional detail, datatype conversion, element count, and timeout.

Example:

```bash
curl "http://localhost:8080/pv/DEVICE:PV?detail=control&timeout=2.5"
```

Supported query parameters:

- `detail`: `value`, `time`, `control`
- `datatype`: `native`, `string`, `integer`, `float`, `enum_string`, `char_string`, `char_bytes`, `char_unicode`, `class_name`, `stsack_string`
- `count`: `0`, `-1`, or a positive integer
- `timeout`: bounded by server configuration

## WebSocket Endpoint

Connect to `ws://localhost:8080/ws/pvs` to subscribe to PV updates.

Recommended flow:

1. Open the WebSocket connection.

2. Wait for the server to send a `connected` message.

3. Read the returned `connection_id` for diagnostics and correlation.

4. Choose your own `subscription_id` on the client side.

5. Send a `subscribe` message with that `subscription_id` and the PV list you want to monitor.

6. Wait for the `subscribed` acknowledgement.

7. Read the initial `snapshot` messages for the subscribed PVs.

8. Continue reading `event` messages for real-time updates.

9. When finished, send `unsubscribe` with the same `subscription_id` you originally chose.

Important:

- The server returns a `connection_id` when the socket is accepted.
- The client chooses the `subscription_id`.
- The same `subscription_id` is then echoed back in `subscribed`, `snapshot`, `event`, and `unsubscribed` messages so the client can match updates to the correct subscription.

Server `connected` message example:

```json
{
  "type": "connected",
  "operation": "monitor",
  "connection_id": "abc123def456",
  "limits": {
    "max_pvs_per_subscription": 64,
    "max_subscriptions_per_connection": 32
  }
}
```

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

`subscribed` acknowledgement example:

```json
{
  "type": "subscribed",
  "operation": "monitor",
  "subscription_id": "main",
  "detail": "time",
  "pvs": ["DEVICE:PV1", "DEVICE:PV2"],
  "ok": true
}
```

Initial snapshot example:

```json
{
  "type": "snapshot",
  "operation": "monitor",
  "subscription_id": "main",
  "pv": "DEVICE:PV1",
  "detail": "time",
  "ok": true,
  "value": 42.5,
  "metadata": {}
}
```

Real-time event example:

```json
{
  "type": "event",
  "operation": "monitor",
  "subscription_id": "main",
  "pv": "DEVICE:PV1",
  "detail": "time",
  "ok": true,
  "value": 43.0,
  "metadata": {}
}
```

Unsubscribe example:

```json
{
  "type": "unsubscribe",
  "subscription_id": "main"
}
```

Unsubscribe acknowledgement example:

```json
{
  "type": "unsubscribed",
  "operation": "monitor",
  "subscription_id": "main",
  "ok": true
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

## Diagnostics Endpoints

- `GET /stats` returns a point-in-time JSON snapshot of active connections, shared monitors, subscriptions, and cached monitor values.
- `GET /stats/ui` serves an internal HTML dashboard that refreshes itself from `GET /stats`.

Because diagnostics are live snapshots, the data can change immediately after the response is generated.

## Health Endpoints

- `GET /health/live`
- `GET /health/ready`

## Local Run

```bash
make install
make dev
```

Production-style local run:

```bash
make run
```

Docker:

```bash
make docker-build
make docker-run
```
