# Local dev

End-to-end. Fresh clone to running UI in five steps.

## Prerequisites

- Node 20.x (matches the CI image)
- Go 1.22+ (for the mock backend)
- (Optional) Python 3.12 + EPICS libs if you want to run the production server locally

## Steps

```bash
# 1. Frontend deps
cd frontend
npm install

# 2. Env
cp env.example .env.local
# edit .env.local — set NEXTAUTH_SECRET to any strong random value
# NEXT_PUBLIC_API_URL=localhost:8080 (the mock)
# NEXT_PUBLIC_ZONE_CODE=test

# 3. Mock backend (in another terminal)
cd ../backend/mockup-websocket-server
go run main.go
# listens on :8080

# 4. Frontend dev server
cd ../../frontend
npm run dev
# http://localhost:8082  (port 8082, not 3000)

# 5. Log in
# username: test   password: test
```

If the WebSocket reconnect spinner stays on the screen, the mock isn't up — or `NEXT_PUBLIC_API_URL` doesn't match the mock's port. See [running-mock-backend](running-mock-backend.md).

## Tests

```bash
cd frontend
npm test                  # watch
npm run test:run          # one-shot
npm run test:coverage     # coverage gate (70/70/70/60 on covered scope)
npm run lint
```

Two WebSocket test seams are described in [overview](../frontend/overview.md#test-seams).

## Useful side-doors against the mock

```bash
# set an analog input
curl http://localhost:8080/pv/AI_TEMP/37.0

# trip a binary input
curl http://localhost:8080/pv/BI_DOOR/true

# switch BI_* to auto-simulate (default is manual)
curl http://localhost:8080/mode/BI/1

# L4 OPCPA: enable 10 % write-failure injection
curl http://localhost:8080/mode/fail-rate/10
```

See [running-mock-backend](running-mock-backend.md) for the rest.

## Optional: Python backend instead of mock

Only if you need to verify against a real EPICS network. See [running-python-backend](running-python-backend.md). Note: the Python server speaks a [different WS dialect](../backend/websocket-protocol.md) — the frontend currently cannot consume it directly.

## Where to ask

If you're stuck on something not covered here, the canonical references are:

- [frontend/README.md](../../frontend/README.md)
- [frontend/AGENTS.md](../../frontend/AGENTS.md)
- [backend/mockup-websocket-server/readme.md](../../backend/mockup-websocket-server/readme.md)
- [backend/python-websocket-server/README.md](../../backend/python-websocket-server/README.md)
