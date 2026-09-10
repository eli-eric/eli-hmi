import type { Message } from '@/app/providers/types'
import { severityTone, worstSeverityTone, type SeverityTone } from './severity'
import { describePv, TRANSPORT_DOWN_REASON } from './pv-tooltip'

/** Text shown when no message has arrived for a PV yet. */
export const UNKNOWN_TEXT = '<>'
/** Text shown for EPICS INVALID severity (3) on a still-connected PV. */
export const INVALID_TEXT = 'PV INV'
/** Text shown when the gateway reports the PV itself as bad (`ok: false`). */
export const DISCONNECTED_TEXT = 'PV DSC'

/**
 * Paint hook a widget puts on its `data-tone` attribute.
 * `undefined` means "no style change" (EPICS severity 0).
 */
export type SeverityPaint = Exclude<SeverityTone, 'none'>

/**
 * Emphasis a widget may ask for when the control system reports nothing
 * unusual — "this particular value is worth noticing". Only
 * `positive-important` is in use today (CONN / FULLP / MSS / ERR when good);
 * the other three are defined in the tone layer and reserved.
 *
 * Emphasis NEVER survives a non-zero severity: an alarmed PV is painted by its
 * alarm, so a green "all good" fill can't sit on top of a MAJOR reading.
 */
export type ValueEmphasis =
  | 'positive-important'
  | 'negative-important'
  | 'positive-neutral'
  | 'negative-neutral'

/** Every tone the layer in `globals.css` knows how to paint. */
export type Tone = SeverityPaint | ValueEmphasis

export interface PresentationOptions {
  /** Widget-chosen emphasis, applied only at severity 0. */
  emphasis?: ValueEmphasis
  /**
   * PV name for the tooltip, used when no message has arrived yet (a message
   * carries its own name). Without it a readout showing `<>` cannot say which
   * PV is silent.
   */
  pvName?: string
  /**
   * Transport state (`isConnected` from `useWebSocketData`). When the backend
   * link is down, no PV is updating any more: whatever is on screen is a stale
   * snapshot, so every readout greys out instead of continuing to look live.
   */
  isConnected?: boolean
}

/**
 * Reason line shown while the backend link is down. Re-exported from
 * `pv-tooltip`, which owns the wording.
 */
export const TRANSPORT_DOWN_TITLE = TRANSPORT_DOWN_REASON

export interface SeverityPresentation {
  /** Tone to paint with, or `undefined` to leave the widget unstyled. */
  tone?: Tone
  /**
   * Text that REPLACES whatever the widget would otherwise show. `undefined`
   * means "keep the widget's own value text" — used for severities where the
   * reading is still real and worth showing (MINOR/MAJOR alarms).
   */
  text?: string
  /**
   * Hover text (rendered as `title`). Always present for a single PV — at a
   * minimum the PV name, which the panel itself never shows. See
   * `describePv`, which decides the wording.
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

/**
 * The backend link is down, so nothing on screen is live. Grey everything out,
 * but keep showing the last value (`text` stays undefined = "use the widget's
 * own text") rather than blanking it — during a gateway restart the operator
 * still wants to see what the machine was doing a moment ago. Only a readout
 * that never received anything falls back to `<>`.
 */
function transportDown(
  msg: AnyMsg,
  opts?: PresentationOptions,
): SeverityPresentation {
  return {
    tone: 'unknown',
    text: msg ? undefined : UNKNOWN_TEXT,
    title: describePv(msg, { pvName: opts?.pvName, isConnected: false }),
  }
}

/**
 * Presentation for a single PV's latest message.
 *
 * Precedence, highest first: transport loss > EPICS severity > widget
 * emphasis. That ordering is the whole point of routing every readout through
 * here — a widget cannot paint over an alarm, and an alarm cannot look live
 * once the link that delivered it is gone.
 */
export function severityPresentation(
  msg: AnyMsg,
  opts?: PresentationOptions,
): SeverityPresentation {
  if (opts?.isConnected === false) return transportDown(msg, opts)
  // The tooltip is never conditional: naming the PV is useful at every
  // severity, including none, and it is the only place the name appears.
  const title = describePv(msg, { pvName: opts?.pvName })
  const tone = severityTone(msg)
  if (tone === 'none') {
    return opts?.emphasis ? { tone: opts.emphasis, title } : { title }
  }
  const base = PRESENTATION[tone]
  if (base.tone !== 'invalid' || !msg) return { ...base, title }
  return { ...base, text: invalidText(msg), title }
}

/**
 * A message that arrived intact but whose payload cannot be displayed as the
 * value it claims to be — a string where a number was expected, or a
 * non-finite number (NaN / ±Infinity).
 *
 * This is the same class of problem as INVALID severity ("the reading cannot
 * be trusted"), so it wears the same tone rather than inventing a private
 * "broken" look, and the reason goes in the tooltip.
 */
export function unreadableValuePresentation(
  reason: string,
): SeverityPresentation {
  return { tone: 'invalid', text: INVALID_TEXT, title: reason }
}

/**
 * Presentation for an aggregate/summary indicator covering several PVs — the
 * worst child severity wins (see {@link worstSeverityTone}). When that worst
 * tone is invalid, the tooltip names every offending PV.
 */
export function aggregateSeverityPresentation(
  msgs: readonly AnyMsg[],
  opts?: PresentationOptions,
): SeverityPresentation {
  if (opts?.isConnected === false) {
    return transportDown(
      msgs.find((m) => !!m),
      opts,
    )
  }
  const worst = worstSeverityTone(msgs.map(severityTone))
  if (worst === 'none') return opts?.emphasis ? { tone: opts.emphasis } : {}
  const base = PRESENTATION[worst]
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
    // Each offender described exactly as it would be on its own — same
    // wording, one place (`describePv`), just flattened under a count.
    title: [
      `${offenders.length} of ${msgs.length} readings unusable:`,
      ...offenders.map((m) => describePv(m)?.replace(/\n/g, ' · ') ?? m.name),
    ].join('\n'),
  }
}
