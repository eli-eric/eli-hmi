# Mockup websocket server

## Description

This mockup server emulates a websocket server that produce random EPICS data based on subscribed PVs.

## How to run

Using Go

```bash
go run main.go
```

This will start a websocket server on `localhost:8080`.
You can change the port by modifying the `port` variable in the `main.go` file.

Using Docker

```bash
docker build -t mockup-server .
docker run -p 8080:8080 mockup-server
```

This will start a websocket server on `localhost:8080` as well.

## Usage

Subscribe to a PV - WS message:

````json
{
  "pvs": ["PV1"],
  "type": "subscribe"
}
Subscribe with defined interval - WS message:
```json
{
  "pvs": ["PV1"],
  "type": "subscribe",
  "interval_ms": 500
}
````

Then you will receive messages like this:

```json
{ "type": "pv", "name": "AI_1", "value": 46.486046048625724, "severity": 0, "ok": true, "timestamp": 1746000001.7116504, "units": "mA" }
```
