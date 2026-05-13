'use client'

import { FC } from 'react'
import { useWebSocketData } from '@/lib/websocket/use-websocket-data'
import styles from './Values.module.css'

const EMPTY = '<>'

/** Float value (precision-formatted) + optional units chip. */
export const FloatValue: FC<{ pvName: string; precision?: number }> = ({
  pvName,
  precision = 3,
}) => {
  const { data } = useWebSocketData<number | null>(pvName, { raw: true })
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
export const IntegerValue: FC<{ pvName: string }> = ({ pvName }) => {
  const { data } = useWebSocketData<number | null>(pvName, { raw: true })
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
export const StringValue: FC<{ pvName: string }> = ({ pvName }) => {
  const { data } = useWebSocketData<string | null>(pvName, { raw: true })
  if (!data || !data.ok || typeof data.value !== 'string') {
    return <span className={styles.placeholder}>{EMPTY}</span>
  }
  return <span className={styles.text}>{data.value}</span>
}

interface BoolPillProps {
  pvName: string
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
  pvName,
  onLabel,
  offLabel,
  onTone = 'positive-important',
  offTone = 'positive-neutral',
}) => {
  const { data } = useWebSocketData<number | null>(pvName, { raw: true })
  if (!data || !data.ok || data.value === null) {
    return (
      <span className={styles.pill} data-tone="unknown">
        {EMPTY}
      </span>
    )
  }
  const isOn = data.value === 1
  return (
    <span
      className={styles.pill}
      data-tone={isOn ? onTone : offTone}
    >
      {isOn ? onLabel : offLabel}
    </span>
  )
}
