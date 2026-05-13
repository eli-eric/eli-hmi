# ADR-0008: `LASER_SPECS` lives under L4 OPCPA, not under `lib/modules/`

**Status:** Accepted
**Date:** 2025-09-20
**Deciders:** ELI-HMI team (L4 OPCPA workstream)

## Context

L4 OPCPA's page renders 5 lasers, each from a `LaserSpec` describing per-laser **topology**: number of MSS items, chiller IDs, flashlamp box IDs, delay presets, modbox state count. The natural question: should this config live in `frontend/src/lib/modules/` next to `l3bt.config.ts`, `l4fbt.config.ts`, `p3.config.ts`?

## Decision

No. `LASER_SPECS` lives at `frontend/src/app/(modules)/l4-opcpa/components/laser-specs.ts`, under the L4 OPCPA module. `lib/modules/` is reserved for `ModuleConfig` — the typed shape consumed by `<ModuleControlPage>` ([ADR-0007](0007-l4-custom-shell-not-modulecontrolpage.md)).

The two configs describe **different concepts**:

- `ModuleConfig` — layout shape (which vacuum panels exist, with which PVs).
- `LaserSpec` — topology (how many of each thing exist for this laser).

Mixing them in `lib/modules/` would conflate independent things and force every consumer of one to learn the other's shape.

## Consequences

- **Positive — locality.** L4-specific topology stays with L4 code. The shared `lib/modules/` directory keeps its single meaning.
- **Positive — readability.** Future readers don't have to mentally separate "layout config" from "topology config" inside one directory.
- **Negative — discoverability.** A new contributor looking for "where are module configs?" might miss `laser-specs.ts`. Mitigated by [l4-opcpa](../frontend/l4-opcpa.md) and the L4 OPCPA README naming it explicitly.
- **Open.** When (or if) a Python EPICS gateway exposes `GET /lasers`, this static config should be replaced with a fetch and topology becomes the canonical source — at that point the file disappears. Tracked at the bottom of `frontend/src/app/(modules)/l4-opcpa/README.md`.

## Alternatives considered

- **Put `LASER_SPECS` under `lib/modules/`.** Rejected — different concept; would erode the meaning of that directory.
- **A new shared `lib/topology/` directory.** Rejected — premature; we have one topology config. *One adapter means a hypothetical seam.*
- **Inline `LASER_SPECS` into `page.tsx`.** Rejected — testability suffers; `LASER_SPECS` is iterated to render the grid and is the natural seam for "swap to a real endpoint later."
