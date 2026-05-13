# Workflow: adding a PV to the mock backend

When a frontend page needs a PV the mock doesn't synthesise by prefix convention. Most PVs work out-of-the-box — the mock infers value type from prefix (`AI_*` / `BI_*` / `SI_*`). The cases below are the ones that need explicit code.

## Case 1: PV that fits the prefix convention

Nothing to do. Subscribe to the PV from the frontend and the mock will:

- spawn a `pvSim` goroutine for it on first subscribe
- broadcast a value every ~300 ms
- shut down the simulator when the last subscriber disconnects

If you want a specific value while developing:

```bash
curl http://localhost:8080/pv/AI_TEMP/37.0
curl http://localhost:8080/pv/BI_DOOR/true
```

If the prefix-default mode is wrong (e.g. you want `BI_*` to auto-toggle):

```bash
curl http://localhost:8080/mode/BI/1   # 1=auto, 2=manual
```

## Case 2: PV that doesn't fit the prefix convention

The mock will return `ok:false` for any PV whose last segment doesn't start with `AI_`, `BI_`, `SI_`, `CMD_`, or `PV_`. Options:

- **Rename the logical PV** in the frontend to fit a prefix. Cheapest.
- **Hand-mirror** the PV in `backend/mockup-websocket-server/main.go` (or `l4_opcpa.go` for laser-control PVs). Add it to the prefix map or the L4 seed function.

## Case 3: L4 OPCPA PV

These are listed canonically in `frontend/src/app/(modules)/l4-opcpa/lib/pv-names.ts`. The mock hand-mirrors the same names in `backend/mockup-websocket-server/l4_opcpa.go`.

To add a new L4 PV:

1. Add a builder to `pv-names.ts`:

   ```ts
   export const pv = {
     // … existing builders …
     myNewSignal: (laser: string) => `AI_${laser}_MY_NEW_SIGNAL` as const,
   }
   ```

2. Add a corresponding entry in `l4_opcpa.go` so the mock seeds it with a sensible default.

3. Add an integration test next to `pv-names.test.ts` to lock the wire-name shape.

4. Use `pv.myNewSignal('NL2')` from a section component — never inline the string.

See [ADR-0006](../adr/0006-pv-name-registry-l4-opcpa.md).

## Case 4: Write-side PV

The mock honors `POST /pv/<NAME>` and `PUT /pv/<NAME>`. Writes:

- update the simulator's last value immediately
- broadcast a `pv` frame to subscribers
- for L4 OPCPA `CMD_*` PVs: dispatch a coordinated effect chain (held for 3 s then released to drift)

If you're adding a CMD PV that should trigger an effect chain, register the dispatch in `l4_opcpa.go` next to the existing chains.

Failure injection helps exercise frontend error UI:

```bash
curl http://localhost:8080/mode/fail-rate/10
```

## Adding a value-type domain mode

If you need a new prefix family (e.g. `WI_*` for waveforms), edit `main.go`:

- Add the mode constant (`wiMode`).
- Add the type-inference branch in `synthValue()` / `loop()`.
- Wire the REST helpers (`/pv/:n/:v`, `/mode/:p/:v`) to parse the new value type.

This is rare — get a review.

## Verify

```bash
# Send a subscribe by hand
websocat 'ws://localhost:8080/ws/pvs?auth=test'
> {"type":"subscribe","pvs":{"AI_MY_NEW_PV":true}}
```

You should see `{"type":"pv","name":"AI_MY_NEW_PV", ...}` frames within ~300 ms.

## Source-of-truth README

[`backend/mockup-websocket-server/readme.md`](../../backend/mockup-websocket-server/readme.md).
