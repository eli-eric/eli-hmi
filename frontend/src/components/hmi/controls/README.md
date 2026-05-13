# controls/

> Architecture context: [`docs/frontend/hmi-components.md`](../../../../../docs/frontend/hmi-components.md). The single-write-endpoint pattern these controls consume is in [ADR-0004](../../../../../docs/adr/0004-single-pv-write-endpoint.md).

Reusable HMI primitives shared by `LaserPanel` and any future control page.
None of these are L4-specific by themselves — they hide common patterns
(layout, write lifecycle, expand-detail) so domain panels stay declarative.

## Modules

### Layout

| Module | Purpose |
|---|---|
| `SectionCard.tsx` | Card with optional title, used to group rows in a panel. |
| `DataRow.tsx` | Label + value + optional cog-action triple, the workhorse of every section. |
| `DetailList.tsx` | Expand-on-click detail list (MSS / Module Errors / Modbox state / Flashlamp channels). Item `state` is a typed union of `ok / err / run / sb / stop / fail / unknown`. |

### Write controls

All write controls consume the `usePvWrite()` hook for their lifecycle and
co-operate with `CogToggle` via the `useCogToggleClose()` Context to dismiss
the panel after a successful write.

| Module | Purpose |
|---|---|
| `usePvWrite.ts` | Single source of truth for the idle/pending/success/error state machine. Owns `pvWrite()` call, success-flash timer, CogToggle close-on-success, unmount-safe cleanup. |
| `ActionButton.tsx` | One-click button that writes a fixed value (defaults to `1` for command triggers). Error appears in a dedicated `role=alert` row below the button (keeps the cog layout stable). |
| `PresetIntegerInput.tsx` | Chip presets + custom integer field, "Confirm" pattern. Supports `min`/`max` bounds with explicit out-of-range messaging. |
| `CogToggle.tsx` | Cog-icon button that opens an inline panel of write controls. Auto-closes on Escape, outside-click, or successful descendant write (via `CogToggleContext`). |

### Readouts

| Module | Purpose |
|---|---|
| `Values.tsx` | `FloatValue`, `IntegerValue`, `StringValue`, `BoolPill` — single-PV subscribers. See `laser-panel/README.md` for why they don't use `PVDisplay`. |

## Relationship to `volume-panel`

`SectionCard` / `DataRow` overlap conceptually with parts of `volume-panel`
but stay independent because:

- `volume-panel` is built around a `VolumePanelProvider` context for vacuum
  systems; the controls here have no domain context.
- `volume-panel` uses `PVDisplay`-wrapped readouts; the controls here keep
  the inline-pill aesthetic the L4 wireframe specifies.
