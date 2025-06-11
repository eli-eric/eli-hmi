import { FC, useMemo, useEffect } from 'react'
import { PolygonIcon } from '@/components/ui/icons'
import { State, useWebSocketMulti } from '@/hooks/useWebSocketData'
import styles from '../styles/valve.module.css'
import { getPrefixedPV } from '@/lib/utils/pv-helpers'

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
 * ValveStatus component
 *
 * Displays the current status of a valve based on PV values
 */
export const ValveStatus: FC<ValveStatusProps> = ({
  openPV,
  closePV,
  onStateChange,
  onStatusUpdate,
}) => {
  const { state, isConnected } = useWebSocketMulti<1 | 0 | null>({
    pvs: [getPrefixedPV(openPV), getPrefixedPV(closePV)],
    onDataUpdate: (data) => {
      console.log('Valve Status Data Update', data)
    },
  })

  const PV_OPEN = getPrefixedPV(openPV)
  const PV_CLOSE = getPrefixedPV(closePV)

  const valveState = useMemo(() => {
    console.log(
      'Valve Status State',
      getPrefixedPV(openPV),
      getPrefixedPV(closePV),
      state,
    )
    if (onStateChange) return onStateChange(state)
    if (PV_OPEN && PV_CLOSE) {
      if (state[PV_OPEN]?.value === 1 && state[PV_CLOSE]?.value === 1) {
        return VALVE_STATE.ERROR
      }
      if (state[PV_OPEN]?.value === 1 && state[PV_CLOSE]?.value === 0) {
        return VALVE_STATE.OPEN
      }
      if (state[PV_OPEN]?.value === 0 && state[PV_CLOSE]?.value === 1) {
        return VALVE_STATE.CLOSED
      }
      if (state[PV_OPEN]?.value === 0 && state[PV_CLOSE]?.value === 0) {
        return VALVE_STATE.TRANSITIONING
      }
    }
  }, [state, onStateChange, PV_OPEN, PV_CLOSE])

  // Use useEffect to call onStatusUpdate when valveState changes
  useEffect(() => {
    if (valveState && onStatusUpdate) {
      onStatusUpdate(valveState)
    }
  }, [valveState, onStatusUpdate])

  if (!isConnected) {
    return <span>N/A</span>
  }

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
  children: React.ReactNode
}

/**
 * Valve component
 *
 * Displays a valve with label and status
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
