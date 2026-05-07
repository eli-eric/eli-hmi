import { FC, useEffect, useMemo } from 'react'

import { PolygonIcon } from '@/components/ui/icons'
import {
  State,
  useWebSocketData,
} from '@/lib/websocket/use-websocket-data'

import styles from '../styles/valve.module.css'

export enum VALVE_STATE {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  TRANSITIONING = 'TRANSITIONING',
  ERROR = 'ERROR',
}

interface ValveStatusProps {
  openPV: string
  closePV: string
  onStateChange?: (status: State<1 | 0 | null>) => VALVE_STATE
  onStatusUpdate?: (status: VALVE_STATE) => void
}

/**
 * Valve open/closed status derived from two binary PVs.
 */
export const ValveStatus: FC<ValveStatusProps> = ({
  openPV,
  closePV,
  onStateChange,
  onStatusUpdate,
}) => {
  const { byPv, state, isConnected } = useWebSocketData<1 | 0 | null>({
    pvs: [openPV, closePV],
  })

  const valveState = useMemo(() => {
    if (onStateChange) return onStateChange(state)
    const openValue = byPv(openPV)?.value
    const closeValue = byPv(closePV)?.value
    if (openValue === 1 && closeValue === 1) return VALVE_STATE.ERROR
    if (openValue === 1 && closeValue === 0) return VALVE_STATE.OPEN
    if (openValue === 0 && closeValue === 1) return VALVE_STATE.CLOSED
    if (openValue === 0 && closeValue === 0) return VALVE_STATE.TRANSITIONING
    return undefined
  }, [byPv, openPV, closePV, onStateChange, state])

  useEffect(() => {
    if (valveState && onStatusUpdate) onStatusUpdate(valveState)
  }, [valveState, onStatusUpdate])

  if (!isConnected) return <span>N/A</span>

  switch (valveState) {
    case VALVE_STATE.OPEN:
      return (
        <div className={styles.valve__status}>
          Valve is <span className={styles.valve__status__value}>OPEN</span>
        </div>
      )
    case VALVE_STATE.CLOSED:
      return (
        <div className={styles.valve__status}>
          Valve is <span className={styles.valve__status__value}>CLOSED</span>
        </div>
      )
    case VALVE_STATE.TRANSITIONING:
      return <div className={styles.valve__status}>In Transition...</div>
    case VALVE_STATE.ERROR:
      return <span className={styles.valve__status__error}>N/A</span>
    default:
      return <div className={styles.valve__status}>Valve state unknown</div>
  }
}

interface ValveProps {
  label: string
  children?: React.ReactNode
}

/**
 * Valve glyph + label slot for status children.
 */
export const Valve: FC<ValveProps> = ({ children, label }) => {
  return (
    <div className={styles.valve}>
      <div className={styles.valve__label}>{label}</div>
      <PolygonIcon />
      <div className={styles.valve__content}>{children}</div>
    </div>
  )
}
