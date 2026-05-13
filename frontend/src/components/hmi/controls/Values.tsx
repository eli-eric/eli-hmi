'use client'

import { FC } from 'react'
import { Message } from '@/app/providers/types'
import styles from './Values.module.css'

const EMPTY = '<>'

/**
 * Readout primitives.
 *
 * These are pure presentational components — they take a `data` message and
 * render. Subscriptions live one level up at the section component, which
 * opens a single `useWebSocketData({ pvs })` for all its readouts and spreads
 * `state[pvName]` into each leaf. See PR #26 / issue #30 for the rationale
 * (~150-200 single-PV subscriptions per /l4-opcpa page load otherwise).
 */

type NumMsg = Message<number | null> | undefined
type StrMsg = Message<string | null> | undefined

/** Float value (precision-formatted) + optional units chip. */
export const FloatValue: FC<{ data: NumMsg; precision?: number }> = ({
  data,
  precision = 3,
}) => {
  if (!data || !data.ok || typeof data.value !== 'number') {
    return <span className={styles.placeholder}>{EMPTY}</span>
  }
  return (
    <>
      <span className={styles.number}>{data.value.toFixed(precision)}</span>
      {data.units && <span className={styles.units}>{data.units}</span>}
    </>
  )
}

/** Integer value. */
export const IntegerValue: FC<{ data: NumMsg }> = ({ data }) => {
  if (!data || !data.ok || typeof data.value !== 'number') {
    return <span className={styles.placeholder}>{EMPTY}</span>
  }
  return (
    <>
      <span className={styles.number}>{Math.round(data.value)}</span>
      {data.units && <span className={styles.units}>{data.units}</span>}
    </>
  )
}

/** String value. */
export const StringValue: FC<{ data: StrMsg }> = ({ data }) => {
  if (!data || !data.ok || typeof data.value !== 'string') {
    return <span className={styles.placeholder}>{EMPTY}</span>
  }
  return <span className={styles.text}>{data.value}</span>
}

interface BoolPillProps {
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
}) => {
  if (!data || !data.ok || data.value === null) {
    return (
      <span className={styles.pill} data-tone="unknown">
        {EMPTY}
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
