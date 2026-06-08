import type { LaserCommand } from '@/app/(modules)/l4-opcpa/lib/pv-names'

/**
 * Builds the per-section "is this command exposed?" predicate from a laser's
 * `commands` list. Buttons for commands not in the list are hidden. The list is
 * required (schema-guaranteed in prod) — no fail-open default, so an omission
 * can never silently re-enable a control.
 */
export const makeCommandGate =
  (commands: readonly LaserCommand[]) =>
  (command: LaserCommand): boolean =>
    commands.includes(command)
