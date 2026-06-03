/**
 * Lasers rendered in the current L4 OPCPA rollout.
 *
 * The GUI will eventually cover APL + NL1–5, but today only NL2 is wired up; the
 * other lasers stay in `lasers.yaml` (ready to re-enable) — we just don't render
 * them yet. Naming the active set here (instead of an inline
 * `spec.laser === 'NL2'` in `page.tsx`) keeps the rollout scope explicit and
 * greppable so it can't rot silently; `rollout.test.ts` is a tripwire that forces
 * any change to the rollout to be deliberate. No `server-only`/`fs` here so it
 * stays unit-testable (same convention as `schema.ts`).
 */
export const CURRENT_L4_OPCPA_LASERS = ['NL2'] as const

const rolloutLasers: ReadonlySet<string> = new Set(CURRENT_L4_OPCPA_LASERS)

/** True if `laser` is part of the current (NL2-only) rollout. */
export function isCurrentRolloutLaser(laser: string): boolean {
  return rolloutLasers.has(laser)
}
