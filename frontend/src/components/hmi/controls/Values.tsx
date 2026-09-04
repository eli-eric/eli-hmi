'use client'

import { FC } from 'react'
import { Message } from '@/app/providers/types'
import {
  severityPresentation,
  type SeverityPresentation,
} from '@/lib/websocket/severity-presentation'
import styles from './Values.module.css'

/**
 * Readout primitives.
 *
 * These are pure presentational components — they take a `data` message and
 * render. Subscriptions live one level up at the section component, which
 * opens a single `useWebSocketData({ pvs })` for all its readouts and spreads
 * `state[pvName]` into each leaf. See PR #26 / issue #30 for the rationale
 * (~150-200 single-PV subscriptions per /l4-opcpa page load otherwise).
 *
 * EPICS severity styling is on by default and comes entirely from
 * `severityPresentation` — the shared decision table — so these primitives
 * never invent their own severity look. Pass `respectSeverity={false}` to opt
 * a specific readout out.
 */

type NumMsg = Message<number | null> | undefined
type StrMsg = Message<string | null> | undefined

interface SeverityAwareProps {
  /** Set false to ignore EPICS severity styling for this readout. Default true. */
  respectSeverity?: boolean
}

function presentation(
  data: Message<unknown> | undefined,
  respectSeverity: boolean,
): SeverityPresentation {
  return respectSeverity ? severityPresentation(data) : {}
}

/** Float value (precision-formatted) + optional units chip. */
export const FloatValue: FC<
  { data: NumMsg; precision?: number } & SeverityAwareProps
> = ({ data, precision = 3, respectSeverity = true }) => {
  const { tone, text, title } = presentation(data, respectSeverity)
  if (text !== undefined) {
    return (
      <span className={styles.placeholder} data-tone={tone} title={title}>
        {text}
      </span>
    )
  }
  if (!data || !data.ok || !Number.isFinite(data.value)) {
    return <span className={styles.placeholder}>{UNKNOWN_FALLBACK}</span>
  }
  return (
    <span className={styles.number} data-tone={tone} title={title}>
      {data.value!.toFixed(precision)}
    </span>
  )
}

/** Integer value. */
export const IntegerValue: FC<{ data: NumMsg } & SeverityAwareProps> = ({
  data,
  respectSeverity = true,
}) => {
  const { tone, text, title } = presentation(data, respectSeverity)
  if (text !== undefined) {
    return (
      <span className={styles.placeholder} data-tone={tone} title={title}>
        {text}
      </span>
    )
  }
  if (!data || !data.ok || !Number.isFinite(data.value)) {
    return <span className={styles.placeholder}>{UNKNOWN_FALLBACK}</span>
  }
  return (
    <span className={styles.number} data-tone={tone} title={title}>
      {Math.round(data.value!)}
    </span>
  )
}

/** String value. */
export const StringValue: FC<{ data: StrMsg } & SeverityAwareProps> = ({
  data,
  respectSeverity = true,
}) => {
  const { tone, text, title } = presentation(data, respectSeverity)
  if (text !== undefined) {
    return (
      <span className={styles.placeholder} data-tone={tone} title={title}>
        {text}
      </span>
    )
  }
  if (!data || !data.ok || typeof data.value !== 'string') {
    return <span className={styles.placeholder}>{UNKNOWN_FALLBACK}</span>
  }
  return (
    <span className={styles.text} data-tone={tone} title={title}>
      {data.value}
    </span>
  )
}

interface BoolPillProps extends SeverityAwareProps {
  data: NumMsg
  /** Text when value === 1, e.g. "is OPEN". */
  onLabel: string
  /** Text when value === 0, e.g. "is CLOSED". */
  offLabel: string
  /** Tone for the ON state. Default 'positive-important' (green). */
  onTone?: 'positive-important' | 'positive-neutral' | 'negative-neutral'
  /** Tone for the OFF state. Default 'positive-neutral' (light gray). */
  offTone?: 'positive-important' | 'positive-neutral' | 'negative-neutral'
}

/** Inline status pill for a single boolean PV. */
export const BoolPill: FC<BoolPillProps> = ({
  data,
  onLabel,
  offLabel,
  onTone = 'positive-important',
  offTone = 'positive-neutral',
  respectSeverity = true,
}) => {
  const { tone, text, title } = presentation(data, respectSeverity)
  // Severity replaces both the on/off tone and (where the shared table says
  // so) the on/off label — an untrustworthy reading shouldn't claim a state.
  if (text !== undefined) {
    return (
      <span className={styles.pill} data-tone={tone} title={title}>
        {text}
      </span>
    )
  }
  if (tone) {
    const isOn = data?.value === 1
    return (
      <span className={styles.pill} data-tone={tone} title={title}>
        {isOn ? onLabel : offLabel}
      </span>
    )
  }
  if (!data || !data.ok || data.value === null) {
    return (
      <span className={styles.pill} data-tone="unknown">
        {UNKNOWN_FALLBACK}
      </span>
    )
  }
  const isOn = data.value === 1
  return (
    <span className={styles.pill} data-tone={isOn ? onTone : offTone}>
      {isOn ? onLabel : offLabel}
    </span>
  )
}

/**
 * Only reached when a caller opts out of severity styling
 * (`respectSeverity={false}`) but the message is still unusable — the shared
 * table supplies this text in every other case.
 */
const UNKNOWN_FALLBACK = '<>'
