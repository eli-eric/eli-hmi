import type { MappedPv } from '@/app/(modules)/l4-opcpa/config/schema'

/**
 * Turning a raw PV value into the words shown for it.
 *
 * Boolean indicators report 1 and 0; a column of bare digits asks the operator
 * to remember what each bit means for each signal. The panel translates them,
 * with the config having the final say (`values:` in the YAML — see
 * `mappedPv`), because what a bit means is domain knowledge that belongs
 * beside the PV rather than in a component.
 *
 * The per-signal default differs by what kind of thing the bit describes,
 * which is why it is passed in rather than baked in here: a Modbox subsystem
 * is ON or OFF, while an MSS interlock grants permission or does not — YES/NO,
 * the same words its summary pill uses.
 */

/** Default for a subsystem that is running or not. */
export const ON_OFF_TEXT: Record<string, string> = { '0': 'OFF', '1': 'ON' }

/** Default for a permission / ready flag, matching the MSS overall pill. */
export const YES_NO_TEXT: Record<string, string> = { '0': 'NO', '1': 'YES' }

/**
 * `values` from the config wins, then the caller's default, then the raw value
 * itself. Falling through to the raw value is deliberate: a "boolean" that
 * one day reports 7 must stay visible rather than vanish or be mistranslated.
 *
 * Returns `undefined` when there is no value to show, which is a different
 * thing from a value with no wording — the caller renders its own placeholder.
 */
export function displayValue(
  value: unknown,
  values?: MappedPv['values'],
  defaults: Record<string, string> = {},
): string | undefined {
  if (value === null || value === undefined) return undefined
  const raw = String(value)
  return values?.[raw] ?? defaults[raw] ?? raw
}
