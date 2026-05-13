# ADR-0005: Mock vs Python backend split

**Status:** Accepted
**Date:** 2025-05-01
**Deciders:** ELI-HMI team

## Context

Frontend development should not block on EPICS network access. The production backend needs the EPICS C library, an aioca-compatible runtime, and a route to a live IOC. None of that is appropriate for a laptop or CI runner.

Earlier prototypes shared one Python codebase between dev (in-process fake) and prod (real EPICS). Two issues:

- The fake had to be guarded by `if MOCK_MODE`, which leaked through interfaces.
- Onboarding required setting up a Python environment with EPICS bindings before any frontend work.

## Decision

Two backends as **distinct modules**:

- **Mock (`backend/mockup-websocket-server/`, Go).** Synthesises PVs from name-prefix conventions (`AI_*` float, `BI_*` bool, `SI_*` string). Single binary, no deps. Used in local dev and frontend integration tests.
- **Python (`backend/python-websocket-server/`, FastAPI + aioca).** Production target. Talks to a real EPICS network.

The frontend points at one or the other via `NEXT_PUBLIC_API_URL`. The frontend's WS client is the **adapter** on its side of the **seam**.

## Consequences

- **Positive — locality.** Each backend's complexity stays in its own tree. The Go binary has no aioca dependency; the Python server has no synthetic-drift loop.
- **Positive — leverage.** Onboarding a frontend contributor is `go run main.go` + `npm run dev`. No Python toolchain required.
- **Negative — drift risk.** Two adapters at one seam can diverge. They have — see [ADR-0009](0009-shared-ws-protocol-contract.md). The L4 OPCPA work added explicit "keep the registries in sync" discipline ([ADR-0006](0006-pv-name-registry-l4-opcpa.md)) to address one such drift.
- **Negative — convention coupling.** The mock's prefix conventions (`AI_*` / `BI_*` / `SI_*`) are not how real EPICS names PVs. Frontend code written against the mock may accidentally encode these conventions and break on the real network.

## Alternatives considered

- **One backend with a mode flag.** Rejected — the per-mode `if` branches polluted the codebase. The deletion test pushes the other way.
- **EPICS soft IOC for local dev.** Considered — viable but raises onboarding floor (every contributor installs EPICS Base). Worth revisiting if the synthetic-drift convention causes ongoing bugs.
- **Recording / replaying real EPICS traffic.** Rejected — captures one moment in time; recordings rot.
