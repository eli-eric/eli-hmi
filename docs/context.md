# Context

This file gives the [improve-codebase-architecture skill](../.agents/skills/improve-codebase-architecture/SKILL.md) the domain language it needs to reason about deepening opportunities in this repo without re-discovering the domain.

If you sharpen a term during a grilling conversation, edit it here.

## What the system does

**eli-hmi** is the Human-Machine Interface for ELI Beamlines laser-control rooms. Operators read live values, switch states, and drive command sequences on lab hardware. Hardware speaks EPICS; this stack proxies EPICS through a WebSocket to a browser HMI.

Two backends, one frontend. The frontend is environment-agnostic: `API_URL` (e.g. `localhost:8080`, supplied at container runtime — see [zones](frontend/zones.md#runtime-not-build-time)) is the single host:port used to derive both `ws://<host>/ws/pvs` and `http://<host>/pv` (`frontend/src/types/constants.ts`).

## Modules (top-level)

- **frontend** — Next.js 16 App Router. Renders routes allowed by runtime-mounted zone config.
- **mock-backend** — Go service. Fakes PVs from name-prefix conventions. Dev/test only.
- **python-backend** — FastAPI + aioca. Production adapter onto a real EPICS network.

## Core domain concepts

(Architecture vocabulary lives in [glossary](glossary.md). This section lists the *domain* names a future architecture review should use.)

- **PV** — process variable. Atomic read/write unit. Name + value + severity + units + timestamp.
- **Zone** — runtime deployment profile selected by `ZONE_CODE`. Its YAML file in `CONFIG_DIR` determines which routes a particular operator station can reach and what appears in navigation.
- **Module page** — a control page driven by a `ModuleConfig` declarative descriptor (`l3bt-controls`, `l4fbt-controls`, `p3-controls`). One renderer (`ModuleControlPage`), three configs.
- **L4 OPCPA** — exception to the module-page pattern. Has its own custom shell; its per-laser topology and signal PV names are the only module data currently loaded from runtime YAML.
- **HMI panel** — a reusable compound component (`VolumePanel`, `ConnectorLine`, `LaserPanel`) that engineers compose into pages.
- **PV write** — a single `POST /pv/<NAME>` endpoint that both backends honour and that two frontend call sites use.

## Decisions that should not be re-litigated

Recorded as ADRs in [`/docs/adr/`](adr/):

- WS pub/sub pattern (single connection, channel registry, replay on reconnect)
- Zone-based access control from runtime-mounted YAML (`CONFIG_DIR` + `ZONE_CODE`), enforced by Next.js Proxy
- Compound components for HMI panels
- Single PV write endpoint
- Mock vs Python backend split
- L4 OPCPA's PV-name registry
- L4 OPCPA's custom shell (deliberate opt-out from `ModuleControlPage`)
- Laser specs location
- Runtime zone and L4 OPCPA config ([ADR-0011](adr/0011-runtime-zone-config.md)); config changes require a container restart, not an app rebuild

The open architectural question — explicitly *not yet* an accepted ADR — is whether the mock and Python WS adapters should converge on one shared protocol contract. See [ADR-0009](adr/0009-shared-ws-protocol-contract.md).

## What good deepening looks like here

Deepening candidates worth surfacing should typically:

- Concentrate currently-scattered PV-name string literals behind a named registry (the L4 OPCPA pv-names module is the model).
- Push a configurable, per-page pattern into a deep declarative descriptor like `ModuleConfig` (with the L4 opt-out as the cautionary example of when *not* to).
- Reduce the number of direct `getPrefixedPV` call sites at write time (currently 2, ideally 0 after lifting writes through a hook the way reads are).
- Surface, rather than hide, the mock-vs-Python WS protocol divergence so the team can converge them deliberately.

## What is *not* a deepening opportunity here

- Translating Confluence product specs into source files. Confluence stays canonical for product/spec.
- Generating TS-type docs (TypeDoc et al.). The team prefers hand-written prose.
- Renaming HMI subcomponents to satisfy uniform-case rules across all directories — [the policy already permits PascalCase for single-component files](../frontend/AGENTS.md) (per commit `e9965be`).
- Treating p3/l3bt/l4fbt as runtime-YAML modules before they are migrated. Their `ModuleConfig` objects and bespoke `parts/` wiring remain app code today.
