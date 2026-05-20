# ADR-0007: L4 OPCPA uses a custom page shell, not `ModuleControlPage`

**Status:** Accepted
**Date:** 2025-09-15
**Deciders:** ELI-HMI team (L4 OPCPA workstream)

## Context

The L3BT, L4fBT, and P3 control pages render through one shared shell — `<ModuleControlPage>` — driven by a typed `ModuleConfig`. That shell is opinionated around vacuum systems: interlocks, safety permission, clean-dry-air, backing, roughing, plus a bespoke bottom row.

L4 OPCPA is a different domain. The wireframe specifies a flat 5-column grid of laser status panels — General / Regen / Chillers / Flashlamps / Modbox — with no top/bottom ribbons. Forcing it into `ModuleControlPage` would mean stubbing every vacuum-specific panel.

## Decision

L4 OPCPA has its own page shell at `frontend/src/app/(modules)/l4-opcpa/page.tsx`. It composes the (shared) `LaserPanel` compound component and the (shared) `controls/` primitives directly. It does **not** call `<ModuleControlPage>` and does **not** declare a `ModuleConfig`.

The shared `LaserPanel` and `controls/` modules are usable by future laser-control pages — the opt-out is the *page shell*, not the components.

## Consequences

- **Positive — leverage.** L4 OPCPA gets a layout that fits its domain. `LaserPanel` + `controls/` remain reusable by any future laser page.
- **Positive — locality.** Each shell concentrates the layout decisions for its domain. Adding a vacuum control page doesn't risk breaking laser layout, and vice versa.
- **Negative.** Two page shells means two patterns to teach. New contributors must recognise which one to start from. The L4 OPCPA README and [frontend/l4-opcpa](../frontend/l4-opcpa.md) are explicit about why.
- **Open.** If a third domain appears (e.g. cryogenics), a third shell is acceptable; resist the pull to generalise prematurely. *One adapter means a hypothetical seam; two adapters means a real one.*

## Alternatives considered

- **Force L4 into `ModuleControlPage` with stub panels.** Rejected — stubs add complexity for no leverage; the wireframe explicitly diverges.
- **Generalise `ModuleControlPage` into a `<DomainShell>` abstraction.** Rejected — premature. We have two shells; generalisation would require a third use case to test the abstraction.
- **Per-laser pages.** Rejected — operators want all 5 lasers visible side-by-side; a per-laser route is the wrong UX.
