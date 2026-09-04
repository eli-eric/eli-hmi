import type { Message } from '@/app/providers/types'
import { severityTone, worstSeverityTone, type SeverityTone } from './severity'

/** Text shown when no message has arrived for a PV yet. */
export const UNKNOWN_TEXT = '<>'
/** Text shown for EPICS INVALID severity (3) on a still-connected PV. */
export const INVALID_TEXT = 'PV INV'
/** Text shown when the gateway reports the PV itself as bad (`ok: false`). */
export const DISCONNECTED_TEXT = 'PV DSC'

/**
 * Paint hook a widget puts on its `data-tone` / `data-state` attribute.
 * `undefined` means "no style change" (EPICS severity 0).
 */
export type SeverityPaint = Exclude<SeverityTone, 'none'>

export interface SeverityPresentation {
  /** Tone to paint with, or `undefined` to leave the widget unstyled. */
  tone?: SeverityPaint
  /**
   * Text that REPLACES whatever the widget would otherwise show. `undefined`
   * means "keep the widget's own value text" — used for severities where the
   * reading is still real and worth showing (MINOR/MAJOR alarms).
   */
  text?: string
  /**
   * Hover text (rendered as `title`). Supplied for invalid readings, where the
   * replaced value would otherwise be unrecoverable: it names the PV and what
   * it last read while still trustworthy.
   */
  title?: string
}

/**
 * THE single place that decides how each severity looks.
 *
 * Every widget that renders a PV value routes through `severityPresentation`
 * (or `aggregateSeverityPresentation`) instead of deciding for itself, so the
 * whole panel can be re-styled by editing this one table:
 *
 * - `none`    — severity 0: nothing changes.
 * - `unknown` — no message yet: show `<>`, paint 'unknown'.
 * - `warning` — MINOR (1): keep the real value, tint it.
 * - `error`   — MAJOR (2): keep the real value, tint it.
 * - `invalid` — INVALID (3) or a disconnected/errored PV: the value can't be
 *   trusted, so it is replaced rather than shown in a misleading colour. The
 *   two causes share one tone but read differently: `PV INV` for INVALID
 *   severity, `PV DSC` when the gateway flagged the PV itself (`ok: false`).
 *
 * Widgets supply their own CSS for each tone; only the tone name and the
 * replacement text are decided here.
 */
const PRESENTATION: Record<SeverityTone, SeverityPresentation> = {
  none: {},
  unknown: { tone: 'unknown', text: UNKNOWN_TEXT },
  warning: { tone: 'warning' },
  error: { tone: 'error' },
  invalid: { tone: 'invalid', text: INVALID_TEXT },
}

type AnyMsg = Message<unknown> | null | undefined

/**
 * Both causes of an untrustworthy reading share the 'invalid' tone, but say
 * which one it was. A message flagged bad by the gateway (`ok: false`) reads
 * as disconnected even if it also carries INVALID severity — the transport
 * failure is the more specific, more actionable cause.
 */
function isDisconnected(msg: AnyMsg): boolean {
  return !!msg && !msg.ok
}

function invalidText(msg: AnyMsg): string {
  return isDisconnected(msg) ? DISCONNECTED_TEXT : INVALID_TEXT
}

/** `"24.81"`, or `"unknown"` when there is nothing to show. */
function formatValue(value: unknown): string {
  return value === null || value === undefined ? 'unknown' : String(value)
}

/** `"BI_NL2_MSS_1 — PV disconnected. Last known value: 1 (12:03:44) CA disconnect"` */
function invalidTitle(msg: Message<unknown>): string {
  const cause = isDisconnected(msg)
    ? 'PV disconnected.'
    : 'reading invalid (EPICS INVALID severity).'
  const parts = [`${msg.name} — ${cause}`]
  if (msg.lastValid) {
    const at = Number.isFinite(msg.lastValid.timestamp)
      ? new Date(msg.lastValid.timestamp * 1000).toLocaleTimeString()
      : null
    parts.push(
      `Last known value: ${formatValue(msg.lastValid.value)}${
        at ? ` (at ${at})` : ''
      }`,
    )
  } else {
    parts.push(`Last known value: ${formatValue(msg.value)}`)
  }
  if (msg.error) parts.push(msg.error)
  return parts.join(' ')
}

/** Presentation for a single PV's latest message. */
export function severityPresentation(msg: AnyMsg): SeverityPresentation {
  const base = PRESENTATION[severityTone(msg)]
  if (base.tone !== 'invalid' || !msg) return base
  return { ...base, text: invalidText(msg), title: invalidTitle(msg) }
}

/**
 * Presentation for an aggregate/summary indicator covering several PVs — the
 * worst child severity wins (see {@link worstSeverityTone}). When that worst
 * tone is invalid, the tooltip names every offending PV.
 */
export function aggregateSeverityPresentation(
  msgs: readonly AnyMsg[],
): SeverityPresentation {
  const base = PRESENTATION[worstSeverityTone(msgs.map(severityTone))]
  if (base.tone !== 'invalid') return base
  const offenders = msgs.filter(
    (m): m is Message<unknown> => !!m && severityTone(m) === 'invalid',
  )
  // Only claim "disconnected" when that is uniformly true of the offenders;
  // a mixed bag falls back to the generic invalid label (the tooltip below
  // spells out each PV either way).
  const allDisconnected = offenders.every(isDisconnected)
  return {
    ...base,
    text: allDisconnected ? DISCONNECTED_TEXT : INVALID_TEXT,
    title: [
      `${offenders.length} of ${msgs.length} readings unusable:`,
      ...offenders.map(invalidTitle),
    ].join('\n'),
  }
}
