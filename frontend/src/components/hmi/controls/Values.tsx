'use client'

import React, { FC } from 'react'
import { Message } from '@/app/providers/types'
import {
  severityPresentation,
  unreadableValuePresentation,
  type SeverityPresentation,
  type ValueEmphasis,
} from '@/lib/websocket/severity-presentation'
import { useTransportConnected } from '@/app/providers/socket-provider'
import { resolveUnits } from '@/lib/websocket/units'
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
 *
 * They also grey themselves out when the backend link drops, without the call
 * site doing anything: the transport is read here (`useTransportConnected`)
 * rather than threaded through every section, because "the socket is down"
 * has the same meaning for every readout in the panel and used to be handled
 * by exactly one of them.
 */

type NumMsg = Message<number | null> | undefined
type StrMsg = Message<string | null> | undefined

interface SeverityAwareProps {
  /** Set false to ignore EPICS severity styling for this readout. Default true. */
  respectSeverity?: boolean
  /**
   * Emphasis for a healthy reading — "this value is worth noticing". Applied
   * only at severity 0; any alarm, and the alarm's tone wins. Leave unset for
   * the neutral default, which is what most readouts want.
   */
  emphasis?: ValueEmphasis
}

interface UnitsAwareProps {
  /** Unit from the config file — wins over everything (see `resolveUnits`). */
  units?: string
  /** Unit to use when neither the config nor the PV's metadata supplies one. */
  unitsFallback?: string
}

/**
 * Pairs a rendered value with its unit. Only used on the branches that show a
 * real reading — a unit next to `<>` / `PV INV` / `PV DSC` would be decorating
 * a non-value. With no unit the value is returned untouched, so unit-less
 * readouts keep exactly the layout they had (`.number` is a right-aligned
 * block; a bare sibling span would wrap to the next line).
 */
function withUnits(value: React.ReactElement, unit: string | undefined) {
  if (!unit) return value
  return (
    <span className={styles.valueWithUnits}>
      {value}
      <span className={styles.units}>{unit}</span>
    </span>
  )
}

function usePresentation(
  data: Message<unknown> | undefined,
  respectSeverity: boolean,
  emphasis?: ValueEmphasis,
): SeverityPresentation {
  const isConnected = useTransportConnected()
  if (!respectSeverity) return {}
  return severityPresentation(data, { emphasis, isConnected })
}

/**
 * Numeric readouts: what to show when the message itself is fine but its
 * payload is not a usable number. A wrong type or a NaN is a broken reading,
 * not a missing one, so it reads as invalid rather than quietly showing `<>`
 * as though the PV simply had not reported yet.
 */
function numericFault(data: Message<unknown> | undefined) {
  if (!data || !data.ok || data.value === null || data.value === undefined) {
    return undefined
  }
  if (typeof data.value !== 'number') {
    return unreadableValuePresentation(
      `${data.name}: expected a number, got ${typeof data.value}.`,
    )
  }
  if (!Number.isFinite(data.value)) {
    return unreadableValuePresentation(
      `${data.name}: non-finite reading (NaN or Infinity).`,
    )
  }
  return undefined
}

/** Float value (precision-formatted) + optional units chip. */
export const FloatValue: FC<
  { data: NumMsg; precision?: number } & SeverityAwareProps & UnitsAwareProps
> = ({
  data,
  precision = 3,
  respectSeverity = true,
  emphasis,
  units,
  unitsFallback,
}) => {
  const severity = usePresentation(data, respectSeverity, emphasis)
  // A severity the control system reported outranks our own read of the
  // payload: if the IOC says INVALID, that is the more authoritative story.
  const { tone, text, title } =
    severity.tone === undefined && respectSeverity
      ? (numericFault(data) ?? severity)
      : severity
  const unit = resolveUnits({
    config: units,
    metadata: data?.units,
    fallback: unitsFallback,
  })
  if (text !== undefined) {
    return (
      <span className={styles.placeholder} data-tone={tone} title={title}>
        {text}
      </span>
    )
  }
  if (!data || !data.ok || !Number.isFinite(data.value)) {
    return (
      <span className={styles.placeholder} data-tone={tone ?? 'unknown'}>
        {UNKNOWN_FALLBACK}
      </span>
    )
  }
  return withUnits(
    <span className={styles.number} data-tone={tone} title={title}>
      {data.value!.toFixed(precision)}
    </span>,
    unit,
  )
}

/** Integer value. */
export const IntegerValue: FC<
  { data: NumMsg } & SeverityAwareProps & UnitsAwareProps
> = ({ data, respectSeverity = true, emphasis, units, unitsFallback }) => {
  const severity = usePresentation(data, respectSeverity, emphasis)
  // A severity the control system reported outranks our own read of the
  // payload: if the IOC says INVALID, that is the more authoritative story.
  const { tone, text, title } =
    severity.tone === undefined && respectSeverity
      ? (numericFault(data) ?? severity)
      : severity
  const unit = resolveUnits({
    config: units,
    metadata: data?.units,
    fallback: unitsFallback,
  })
  if (text !== undefined) {
    return (
      <span className={styles.placeholder} data-tone={tone} title={title}>
        {text}
      </span>
    )
  }
  if (!data || !data.ok || !Number.isFinite(data.value)) {
    return (
      <span className={styles.placeholder} data-tone={tone ?? 'unknown'}>
        {UNKNOWN_FALLBACK}
      </span>
    )
  }
  return withUnits(
    <span className={styles.number} data-tone={tone} title={title}>
      {Math.round(data.value!)}
    </span>,
    unit,
  )
}

/** String value. */
export const StringValue: FC<{ data: StrMsg } & SeverityAwareProps> = ({
  data,
  respectSeverity = true,
  emphasis,
}) => {
  const { tone, text, title } = usePresentation(data, respectSeverity, emphasis)
  if (text !== undefined) {
    return (
      <span className={styles.placeholder} data-tone={tone} title={title}>
        {text}
      </span>
    )
  }
  if (!data || !data.ok || typeof data.value !== 'string') {
    return (
      <span className={styles.placeholder} data-tone={tone ?? 'unknown'}>
        {UNKNOWN_FALLBACK}
      </span>
    )
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
  /**
   * Emphasis for the ON state only; OFF is always neutral. Used by the few
   * indicators where "on" genuinely means "good" (connection, full power).
   * A shutter being open is not good or bad, so it passes nothing.
   */
  onEmphasis?: ValueEmphasis
}

/** Inline status pill for a single boolean PV. */
export const BoolPill: FC<BoolPillProps> = ({
  data,
  onLabel,
  offLabel,
  onEmphasis,
  respectSeverity = true,
}) => {
  const isOnValue = data?.value === 1
  const { tone, text, title } = usePresentation(
    data,
    respectSeverity,
    isOnValue ? onEmphasis : undefined,
  )
  // Severity replaces both the on/off tone and (where the shared table says
  // so) the on/off label — an untrustworthy reading shouldn't claim a state.
  if (text !== undefined) {
    return (
      <span
        className={styles.pill}
        data-tone-surface="chip"
        data-tone={tone}
        title={title}
      >
        {text}
      </span>
    )
  }
  if (!data || !data.ok || data.value === null) {
    return (
      <span
        className={styles.pill}
        data-tone-surface="chip"
        data-tone={tone ?? 'unknown'}
        title={title}
      >
        {UNKNOWN_FALLBACK}
      </span>
    )
  }
  return (
    <span
      className={styles.pill}
      data-tone-surface="chip"
      data-tone={tone}
      title={title}
    >
      {isOnValue ? onLabel : offLabel}
    </span>
  )
}

/**
 * Only reached when a caller opts out of severity styling
 * (`respectSeverity={false}`) but the message is still unusable — the shared
 * table supplies this text in every other case.
 */
const UNKNOWN_FALLBACK = '<>'
