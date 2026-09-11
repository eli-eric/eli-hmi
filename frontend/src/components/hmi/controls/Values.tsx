'use client'

import React, { FC } from 'react'
import { Message } from '@/app/providers/types'
import {
  severityPresentation,
  unreadableValuePresentation,
  type SeverityPresentation,
  type ValueEmphasis,
} from '@/lib/websocket/severity-presentation'
import { describePv } from '@/lib/websocket/pv-tooltip'
import { useTransportConnected } from '@/app/providers/socket-provider'
import { resolveUnits } from '@/lib/websocket/units'
import { resolveFormat } from '@/lib/websocket/format'
import {
  getFormattedValue,
  type ValueFormatOptions,
} from '@/lib/utils/pv-helpers'
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
  /**
   * PV this readout shows. Only used for the hover text, and only needed
   * before the first message arrives — a message names itself. Worth passing
   * anyway: a readout stuck on `<>` is exactly when the operator wants to
   * know which record is silent.
   */
  pvName?: string
  /** Set false to ignore EPICS severity styling for this readout. Default true. */
  respectSeverity?: boolean
  /**
   * Emphasis for a healthy reading — "this value is worth noticing". Applied
   * only at severity 0; any alarm, and the alarm's tone wins. Leave unset for
   * the neutral default, which is what most readouts want.
   */
  emphasis?: ValueEmphasis
}

interface FormatAwareProps {
  /**
   * How to render the number, from config (see `resolveFormat`). Leave unset
   * for the shared default of three decimal places.
   */
  format?: ValueFormatOptions
  /** Format to use when the config is silent, for a readout that needs its own. */
  formatFallback?: ValueFormatOptions
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
  pvName?: string,
): SeverityPresentation {
  const isConnected = useTransportConnected()
  // Opting out of severity styling opts out of the tone, not of knowing which
  // PV this is, so the tooltip survives.
  if (!respectSeverity) return { title: describePv(data, { pvName }) }
  return severityPresentation(data, { emphasis, isConnected, pvName })
}

/**
 * What to show when the message itself is fine but its payload is not the kind
 * of value this readout renders. A wrong type is a broken reading, not a
 * missing one, so it reads as invalid rather than quietly showing `<>` as
 * though the PV had never reported — a lie that hides the actual fault. It
 * cost a debugging session on the Regen state row, which sat on `<>` while the
 * PV was happily sending enum indices.
 */
function hasPayload(
  data: Message<unknown> | undefined,
): data is Message<unknown> {
  return !!data && data.ok && data.value !== null && data.value !== undefined
}

/** Numeric readouts: a non-number, a NaN or an Infinity is unreadable. */
function numericFault(data: Message<unknown> | undefined) {
  if (!hasPayload(data)) return undefined
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

/**
 * String readouts: anything else is unreadable. The usual cause is an enum
 * (mbbi) record subscribed at its native type, where Channel Access sends the
 * state's index instead of its name — the fix for that is `datatype:
 * 'enum_string'` on the subscription, and this message is what points at it.
 */
function stringFault(data: Message<unknown> | undefined) {
  if (!hasPayload(data)) return undefined
  if (typeof data.value !== 'string') {
    return unreadableValuePresentation(
      `${data.name}: expected a string, got ${typeof data.value} (${String(
        data.value,
      )}). An enum record read at its native type sends its index, not its name.`,
    )
  }
  return undefined
}

/** Float value (config-formatted) + optional units chip. */
export const FloatValue: FC<
  { data: NumMsg } & SeverityAwareProps &
    UnitsAwareProps &
    FormatAwareProps
> = ({
  data,
  pvName,
  respectSeverity = true,
  emphasis,
  units,
  unitsFallback,
  format,
  formatFallback,
}) => {
  const severity = usePresentation(data, respectSeverity, emphasis, pvName)
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
      <span
        className={styles.placeholder}
        data-tone={tone ?? 'unknown'}
        title={title}
      >
        {UNKNOWN_FALLBACK}
      </span>
    )
  }
  // Formatting happens only on this branch, where the value is a finite
  // number — every other outcome replaced it with a placeholder above, so
  // `getFormattedValue`'s own 'N/A' is unreachable here.
  return withUnits(
    <span className={styles.number} data-tone={tone} title={title}>
      {getFormattedValue({
        value: data.value,
        options: resolveFormat({ config: format, fallback: formatFallback }),
      })}
    </span>,
    unit,
  )
}

/** Integer value; a config `format` overrides the default rounding. */
export const IntegerValue: FC<
  { data: NumMsg } & SeverityAwareProps &
    UnitsAwareProps &
    FormatAwareProps
> = ({
  data,
  pvName,
  respectSeverity = true,
  emphasis,
  units,
  unitsFallback,
  format,
  formatFallback,
}) => {
  const severity = usePresentation(data, respectSeverity, emphasis, pvName)
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
      <span
        className={styles.placeholder}
        data-tone={tone ?? 'unknown'}
        title={title}
      >
        {UNKNOWN_FALLBACK}
      </span>
    )
  }
  return withUnits(
    <span className={styles.number} data-tone={tone} title={title}>
      {format ?? formatFallback
        ? getFormattedValue({
            value: data.value,
            options: resolveFormat({
              config: format,
              fallback: formatFallback,
            }),
          })
        : Math.round(data.value!)}
    </span>,
    unit,
  )
}

/** String value. */
export const StringValue: FC<{ data: StrMsg } & SeverityAwareProps> = ({
  data,
  pvName,
  respectSeverity = true,
  emphasis,
}) => {
  const severity = usePresentation(data, respectSeverity, emphasis, pvName)
  // A severity the control system reported outranks our own read of the
  // payload, exactly as in the numeric readouts above.
  const { tone, text, title } =
    severity.tone === undefined && respectSeverity
      ? (stringFault(data) ?? severity)
      : severity
  if (text !== undefined) {
    return (
      <span className={styles.placeholder} data-tone={tone} title={title}>
        {text}
      </span>
    )
  }
  if (!data || !data.ok || typeof data.value !== 'string') {
    return (
      <span
        className={styles.placeholder}
        data-tone={tone ?? 'unknown'}
        title={title}
      >
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
  pvName,
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
    pvName,
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
