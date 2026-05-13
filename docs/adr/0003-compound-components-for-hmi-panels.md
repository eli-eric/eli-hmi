# ADR-0003: Compound components for HMI panels

**Status:** Accepted
**Date:** 2025-06-15
**Deciders:** ELI-HMI team

## Context

The audience for new pages is control-system engineers, not React specialists. A control page wires dozens of PVs into specific layouts (volumes, connectors, valves, sensor bars, laser sections). Two earlier shapes were considered:

1. **Atomic props-driven components.** Every panel exposes its full shape as nested props. The result is multi-screen prop literals that are hard to read and trivially wrong.
2. **Imperative children.** Each panel accepts opaque children but caller manages state. State sprawl across pages.

## Decision

Compound-component pattern: a parent attaches subcomponents as static properties (`VolumePanel.SensorBar`, `LaserPanel.Regen`). Composition is declarative; state lives inside the compound parent (via context) where appropriate. Engineers wire **PV names**, not React state.

Affected **modules**: `VolumePanel`, `ConnectorLine`, `LaserPanel`. The reusable `controls/` primitives (`SectionCard`, `DataRow`, `usePvWrite`, `ActionButton`, `PresetIntegerInput`, `CogToggle`) share the same authoring discipline without requiring a single compound parent.

## Consequences

- **Positive — leverage.** Engineers compose pages from a small dot-namespaced grammar. The author does not need to know React state management.
- **Positive — locality.** Bugs in panel logic concentrate in the panel's directory rather than propagating across pages.
- **Negative.** Compound components are not the React community default; new contributors need to learn the pattern. The compound parent uses context which TypeScript-savvy contributors expect to find explicitly.
- **Open.** Filename casing varies across HMI directories — see the AGENTS.md carve-out and [issue #33 / commit `e9965be`](../../frontend/AGENTS.md). Not a refactor target; documented and bounded.

## Alternatives considered

- **Atomic + JSX schema.** Rejected — pushes too much shape into props.
- **Headless UI library with render-props.** Rejected — adds an external dependency for a domain that prefers in-house primitives.
- **Per-page bespoke components from day 1.** Rejected — defeats the reuse motive; engineers would re-discover the same patterns per page.
