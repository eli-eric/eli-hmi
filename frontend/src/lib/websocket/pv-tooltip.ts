import type { Message } from '@/app/providers/types'
import { EPICS_SEVERITY } from './severity'

/**
 * What the hover text on a single-PV readout says.
 *
 * Every readout gets one, always naming the PV — on a dense panel of anonymous
 * numbers, "which record is this?" is the question an operator most often has,
 * and it is unanswerable from the screen. Beyond the name, the tooltip only
 * says something when there is something to say:
 *
 * - severity 0: the name alone.
 * - MINOR / MAJOR: severity and status — *how bad* and *why*.
 * - INVALID: severity and status, plus the last value seen while the reading
 *   was still trustworthy (the displayed value has been replaced by PV INV).
 * - PV disconnected: no severity or status — a dead channel's last alarm
 *   fields describe the past, not the present — but the last known value, so
 *   the operator can still see where the machine was.
 *
 * Aggregate indicators cover several PVs and have their own tooltip; see
 * `aggregateSeverityPresentation`.
 */

/**
 * EPICS alarm status names, indexed by code (`epicsAlarm.h`
 * `epicsAlarmConditionStrings`).
 *
 * These are the control system's own words. To show operators something
 * friendlier — "sensor above high-high limit" instead of `HIHI` — replace the
 * entries here, or have the gateway send a phrase instead of a code:
 * `describeStatus` passes a string through untouched, so that needs no
 * frontend change.
 */
export const EPICS_STATUS_TEXT = [
  'NO_ALARM',
  'READ',
  'WRITE',
  'HIHI',
  'HIGH',
  'LOLO',
  'LOW',
  'STATE',
  'COS',
  'COMM',
  'TIMEOUT',
  'HWLIMIT',
  'CALC',
  'SCAN',
  'LINK',
  'SOFT',
  'BAD_SUB',
  'UDF',
  'DISABLE',
  'SIMM',
  'READ_ACCESS',
  'WRITE_ACCESS',
] as const

/** EPICS severity names, indexed by code (`epicsAlarm.h`). */
const EPICS_SEVERITY_TEXT = ['NO_ALARM', 'MINOR', 'MAJOR', 'INVALID'] as const

/**
 * Status as text: a phrase from the gateway verbatim, a known code by name,
 * an unknown code as `status 42`, and nothing at all when the gateway did not
 * send one (a backend at `detail: 'value'`, or the legacy message shape).
 */
export function describeStatus(status: Message['status']): string | null {
  if (status === null || status === undefined) return null
  if (typeof status === 'string') return status.trim() || null
  return EPICS_STATUS_TEXT[status] ?? `status ${status}`
}

/** Severity as text; unknown codes fall back to their number. */
export function describeSeverity(severity: number): string {
  return EPICS_SEVERITY_TEXT[severity] ?? `severity ${severity}`
}

function formatValue(value: unknown): string {
  return value === null || value === undefined ? 'unknown' : String(value)
}

/** `"24.810 (at 12:03:44)"`, or just the value when the timestamp is unusable. */
function formatReading(value: unknown, timestamp: number): string {
  const at = Number.isFinite(timestamp)
    ? new Date(timestamp * 1000).toLocaleTimeString()
    : null
  return `${formatValue(value)}${at ? ` (at ${at})` : ''}`
}

/**
 * The last reading taken while the PV was still trustworthy. `lastValid` is
 * attached by `useWebSocketData`; falling back to the message's own value
 * covers a PV that went bad on its very first message (nothing was ever
 * remembered) and one whose payload survived the alarm.
 */
function lastKnownReading(msg: Message<unknown>): string {
  return msg.lastValid
    ? formatReading(msg.lastValid.value, msg.lastValid.timestamp)
    : formatReading(msg.value, msg.timestamp)
}

export interface TooltipOptions {
  /**
   * PV name to use when no message has arrived yet — the case where the panel
   * shows `<>` and the operator most needs to know which record is silent.
   */
  pvName?: string
  /** Transport state; see `severityPresentation`. */
  isConnected?: boolean
}

/** Reason line shown while the backend link is down. */
export const TRANSPORT_DOWN_REASON =
  'Backend disconnected — this is the last value received, not a live reading.'

/**
 * Builds the hover text for one PV. Returns `undefined` only when there is
 * nothing at all to identify — no message and no name from the caller.
 */
export function describePv(
  msg: Message<unknown> | null | undefined,
  opts: TooltipOptions = {},
): string | undefined {
  const name = msg?.name ?? opts.pvName
  if (!name) return undefined
  const lines = [name]

  if (opts.isConnected === false) {
    lines.push(TRANSPORT_DOWN_REASON)
    if (msg) lines.push(`Last known value: ${lastKnownReading(msg)}`)
    return lines.join('\n')
  }

  if (!msg) return lines.join('\n')

  // A disconnected channel reports no current condition: its severity and
  // status fields describe whatever it was doing before it went away, so
  // repeating them here would present stale facts as live ones.
  if (!msg.ok) {
    lines.push('PV disconnected')
    if (msg.error) lines.push(msg.error)
    lines.push(`Last known value: ${lastKnownReading(msg)}`)
    return lines.join('\n')
  }

  if (msg.severity === EPICS_SEVERITY.NONE) return lines.join('\n')

  lines.push(`Severity: ${describeSeverity(msg.severity)}`)
  const status = describeStatus(msg.status)
  if (status) lines.push(`Status: ${status}`)

  // INVALID replaces the reading on screen with PV INV, so the tooltip is the
  // only place left that can say what it was.
  if (msg.severity === EPICS_SEVERITY.INVALID) {
    lines.push(`Last good value: ${lastKnownReading(msg)}`)
  }

  return lines.join('\n')
}
