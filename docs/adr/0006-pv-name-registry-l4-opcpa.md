# ADR-0006: PV name registry for L4 OPCPA

**Status:** Partially superseded by [ADR-0010](0010-per-laser-yaml-config.md) and [ADR-0011](0011-runtime-zone-config.md) — read/write *signal* PV names now live as full strings in the zone-referenced runtime YAML, not assembled by builders. Only the **command** vocabulary (`LASER_COMMANDS` + `pv.cmd`) remains in `pv-names.ts`.
**Date:** 2025-09-15
**Deciders:** ELI-HMI team (L4 OPCPA workstream)

## Context

L4 OPCPA wires hundreds of PVs across 5 lasers × 5 sections (General, Regen, Chillers, Flashlamps, Modbox) × per-laser topology. Initial code used inline string templates:

```ts
const shutterPv = `BI_${laser}_SHUTTER`
```

Three problems:

- **No type safety.** Typos surface only as runtime "PV not found" frames.
- **Mock mirror drift.** The Go mock hand-mirrors every L4 PV in `l4_opcpa.go`. With inline templates on the frontend, the canonical naming convention had no home — the mock and frontend could drift silently.
- **No refactor handle.** Renaming a PV family meant grepping for inline strings across two codebases.

## Decision

Every L4 OPCPA PV name is constructed via a typed builder in `frontend/src/app/(modules)/l4-opcpa/lib/pv-names.ts`. The file is the **canonical source** for L4 PV-name shapes. Tests in `pv-names.test.ts` lock the wire-name format.

The mock backend (`backend/mockup-websocket-server/l4_opcpa.go`) hand-mirrors the same shapes. A header comment in `l4_opcpa.go` points back to `pv-names.ts`. Keeping them in sync is part of the workflow — see [adding-a-pv-to-mock-backend](../workflows/adding-a-pv-to-mock-backend.md#case-3-l4-opcpa-pv).

## Consequences

- **Positive — locality.** PV-name conventions live in one file. The mock either matches or fails tests at integration time.
- **Positive — leverage.** Typos become type errors; renames are one file edit.
- **Positive — readability.** `pv.cmd('NL2', 'START_LASER')` reads better than the equivalent string literal at every call site.
- **Negative — coupling.** The registry encodes mock-convention prefixes (`BI_*`, `AI_*`, `CMD_*`) that are not how a production EPICS network names PVs. When the python-backend gains writes, either the registry indirects (adapter under the hood) or the production EPICS database adopts these names (the team's stated plan).
- **Open.** No automatic check that the Go mock's mirror is in sync with `pv-names.ts`. A cross-codebase test or codegen step could close this gap.

## Alternatives considered

- **Codegen from a schema.** Considered — viable; deferred until the team agrees on the canonical naming convention with the EPICS DB owners.
- **Inline strings + lint rule.** Rejected — would catch typos but not refactor cleanly.
- **PV registry on the mock as canonical.** Rejected — the mock is a development tool; the frontend's logical names should be the source of truth.
