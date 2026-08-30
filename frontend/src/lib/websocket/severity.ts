import type { Message } from '@/app/providers/types'

/** EPICS alarm severities (epicsAlarm.h). */
export const EPICS_SEVERITY = {
  NONE: 0,
  MINOR: 1,
  MAJOR: 2,
  INVALID: 3,
} as const

/**
 * Abstract severity tone, independent of any single component's tone/state
 * vocabulary (DetailList's `'ok'|'err'|...`, ChillerCell's `CellTone`, a
 * pill's `'positive-important'|...`). Every "should this PV value be styled
 * as alarmed/invalid" decision should go through this, so the EPICS mapping
 * lives in exactly one place:
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
