/**
 * Engineering units for a numeric readout can come from three places. This is
 * the single place that decides which one wins, so the order can be re-tuned
 * without touching any widget:
 *
 * 1. `config`   — `units` in the zone's laser config. Operator-controlled, so
 *                 it wins.
 * 2. `metadata` — the PV's own EGU field. Currently always absent: the
 *    gateway only sends `units` at detail 'control' and subscriptions run at
 *    'time' (see `use-websocket.ts`). When the startup metadata fetch lands,
 *    it feeds this slot — callers do not change.
 * 3. `fallback` — a default hardcoded by the component, for PVs whose IOC
 *    publishes no EGU and where the config is silent.
 */
export interface UnitsSources {
  config?: string
  metadata?: string | null
  fallback?: string
}

/** Blank/whitespace-only counts as "not specified", not as an empty unit. */
function usable(unit: string | null | undefined): string | undefined {
  const trimmed = unit?.trim()
  return trimmed ? trimmed : undefined
}

export function resolveUnits({
  config,
  metadata,
  fallback,
}: UnitsSources): string | undefined {
  return usable(config) ?? usable(metadata) ?? usable(fallback)
}
