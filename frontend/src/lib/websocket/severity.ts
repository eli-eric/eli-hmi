import type { Message } from '@/app/providers/types'

/** EPICS alarm severities (epicsAlarm.h). */
/**
 * `epicsAlarm.h` status for a record that has never been processed. The one
 * INVALID reading that can be expected rather than wrong: a record nobody has
 * run yet has no value to report.
 */
export const STATUS_UDF = 17

/** That status as a gateway may send it instead of the code. */
export const isUdf = (status: number | string | null | undefined): boolean =>
  typeof status === 'string'
    ? status.trim().toUpperCase() === 'UDF'
    : status === STATUS_UDF

export const EPICS_SEVERITY = {
  NONE: 0,
  MINOR: 1,
  MAJOR: 2,
  INVALID: 3,
} as const

/**
 * Abstract severity tone. Every "should this PV value be styled as
 * alarmed/invalid" decision goes through this, so the EPICS mapping lives in
 * exactly one place; `severity-presentation.ts` turns the result into the
 * tone/text/tooltip a widget renders, and `globals.css` decides what each tone
 * looks like:
 *
 * - 'unknown': no message has arrived yet (cold start) — not a real severity.
 * - 'invalid': the gateway/backend flagged the PV bad (disconnect, CA error,
 *   any `ok: false`), or EPICS severity is INVALID (3). Both mean the value
 *   can't be trusted, even when one is technically present.
 * - 'error': EPICS severity MAJOR (2).
 * - 'warning': EPICS severity MINOR (1).
 * - 'none': severity 0 (or absent) — no style change.
 */
export type SeverityTone = 'unknown' | 'invalid' | 'error' | 'warning' | 'none'

export function severityTone(
  msg: Pick<Message<unknown>, 'ok' | 'severity'> | null | undefined,
): SeverityTone {
  if (!msg) return 'unknown'
  if (!msg.ok || msg.severity === EPICS_SEVERITY.INVALID) return 'invalid'
  if (msg.severity === EPICS_SEVERITY.MAJOR) return 'error'
  if (msg.severity === EPICS_SEVERITY.MINOR) return 'warning'
  return 'none'
}

const SEVERITY_RANK: Record<SeverityTone, number> = {
  none: 0,
  unknown: 0,
  warning: 1,
  error: 2,
  invalid: 3,
}

/**
 * Reduces a group of children's tones to the single worst one, for an
 * aggregate/summary indicator (e.g. an overall pill covering a list of PVs).
 * `'unknown'` only wins when EVERY child is unknown (no data has arrived for
 * any of them yet) — as soon as even one child has real data, the aggregate
 * should reflect that data rather than sit on the "cold start" placeholder.
 */
export function worstSeverityTone(
  tones: readonly SeverityTone[],
): SeverityTone {
  if (tones.length === 0 || tones.every((t) => t === 'unknown')) {
    return 'unknown'
  }
  return tones
    .filter((t) => t !== 'unknown')
    .reduce((worst, t) => (SEVERITY_RANK[t] > SEVERITY_RANK[worst] ? t : worst))
}
