# Glossary

Two vocabularies, cross-referenced.

The **architecture vocabulary** comes from the [improve-codebase-architecture skill's LANGUAGE.md](../.agents/skills/improve-codebase-architecture/LANGUAGE.md) and is the source of truth — every doc and ADR in this tree uses these terms exactly.

The **domain vocabulary** comes from the EPICS / laser-control world the HMI controls.

## Architecture vocabulary

| Term | Definition |
| --- | --- |
| **Module** | Anything with an interface and an implementation. Scale-agnostic (function, class, package, slice). Avoid *unit, component, service*. |
| **Interface** | Everything a caller must know to use the module: types, invariants, ordering, error modes, configuration, performance. Not just the type signature. |
| **Implementation** | The code inside a module. |
| **Adapter** | A concrete thing satisfying an interface at a seam. Describes *role*, not substance. |
| **Depth** | Leverage at the interface — a lot of behaviour behind a small interface. **Deep** = high leverage. **Shallow** = interface nearly as complex as the implementation. |
| **Seam** *(Feathers)* | Where an interface lives; a place behaviour can be altered without editing in place. Avoid *boundary*. |
| **Leverage** | What callers get from depth. |
| **Locality** | What maintainers get from depth: change, bugs, knowledge concentrated in one place. |

Principles drawn from the same source:

- **Deletion test** — if deleting the module concentrates complexity elsewhere, it was earning its keep.
- **The interface is the test surface.**
- **One adapter = hypothetical seam. Two adapters = real seam.**

## Domain vocabulary

| Term | Meaning | Cross-ref |
| --- | --- | --- |
| **PV** | *Process Variable* — a named, typed channel on the EPICS network (e.g. `AI_TEMP_01`). The atomic unit of read/write traffic. | The frontend treats each PV as a *channel* across the WS [seam](architecture.md#seam-1-websocket-pubsub-wspvs). |
| **EPICS** | Experimental Physics and Industrial Control System. The control-system framework whose PVs we proxy. | The python-backend [module](architecture.md#3-backendpython-websocket-server--fastapi--aioca) is an adapter from EPICS to the WS protocol. |
| **CA / aioca** | Channel Access (EPICS protocol). `aioca` is the asyncio binding. | Implementation of the python-backend module. |
| **Severity** | EPICS alarm level on a PV value (0 = NO_ALARM, 1 = MINOR, 2 = MAJOR, 3 = INVALID). | Part of the WS frame interface — see [websocket-protocol](backend/websocket-protocol.md). |
| **`AI_*` / `BI_*` / `SI_*`** | Mock-backend PV-name prefixes that disambiguate value type: Analog Input (float), Binary Input (bool), String Input. | Encoded in the mock module's implementation. The real EPICS network does not use these prefixes. |
| **`CMD_*` / `PV_*`** | Command and writable-PV prefixes used by the L4 OPCPA registry. | [pv-naming](reference/pv-naming.md). |
| **Dev-prefix** | A per-environment prefix (`DEV:`, `STAGE:`, …) prepended to logical PV names at subscribe-time by `getPrefixedPV`. | [pv-naming](reference/pv-naming.md). |
| **Zone** | A runtime deployment profile: `ZONE_CODE` selects a YAML file under `CONFIG_DIR` that declares navigation, reachable routes, and supported module config references. | The Next.js Proxy enforces route access — [frontend/zones](frontend/zones.md). |
| **MSS** | Machine Safety System — the interlock layer that prevents unsafe states. | Surfaced via PVs; the frontend renders state but does not implement it. |
| **Regen** | Regenerative amplifier in the L4 OPCPA laser chain. | One of the five [LaserPanel](frontend/l4-opcpa.md) sections. |
| **Flashlamp** | Pump-light source for laser amplifiers; arranged in channels with timing and energy controls. | Section of the LaserPanel. |
| **Modbox** | A box of modulator-control electronics for the laser; per-channel modulator parameters. | Section of the LaserPanel. |
| **Modbox / OPCPA** | Optical Parametric Chirped-Pulse Amplification — the laser architecture L4 uses. | Subject of [frontend/l4-opcpa](frontend/l4-opcpa.md). |
| **L3 / L4 / P3** | Beamlines / module identifiers. Each currently has a control page. | [frontend/module-pages](frontend/module-pages.md). |
| **Operator station** | A locked-down browser on a control-room machine. | [runbooks/operator-stations](runbooks/operator-stations.md). |

## Cross-references

| Domain term | Lives behind which **seam** / **module**? |
| --- | --- |
| PV (subscribe path) | WS pub/sub seam → `useWebSocketData` adapter |
| PV (write path) | `POST /pv/<NAME>` seam → `fetch` adapter |
| Severity, units, timestamp | WS frame interface |
| Dev-prefix | Module-internal: `getPrefixedPV` in the frontend WS client implementation |
| Zone | Module-internal seam: Next.js Proxy adapter over the runtime zone-config interface |
| Regen / Flashlamp / Modbox | Implementation detail of the LaserPanel module (compound component) |
