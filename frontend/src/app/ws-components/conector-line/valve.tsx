import { PolygonIcon } from '@/components/ui/icons'
import { State, useWebSocketMulti } from '@/hooks/useWebSocketData'

import styles from './valve.module.css'
import { FC, PropsWithChildren, useMemo } from 'react'

export enum VALVE_STATE {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  TRANSITIONING = 'TRANSITIONING',
  ERROR = 'ERROR',
}

interface SUValveStatusProps {
  pvNames: string[]
  onStatusChange?: (status: State<boolean>) => VALVE_STATE
  onStatusUpdate?: (status: VALVE_STATE) => void
}

export const ValveStatus = ({
  pvNames,
  onStatusChange,
  onStatusUpdate,
}: SUValveStatusProps) => {
  const { state, isConnected } = useWebSocketMulti<boolean>({
    pvs: pvNames,
    onDataUpdate: (data) => {
      console.log('SU Valve Status Data Update', data)
    },
  })
  const PV_OPEN = pvNames.find((pv) => pv.includes('OPEN'))
  const PV_CLOSE = pvNames.find((pv) => pv.includes('CLOSE'))

  const valveState = useMemo(() => {
    if (onStatusChange) return onStatusChange(state)
    if (PV_OPEN && PV_CLOSE) {
      if (state[PV_OPEN]?.value && state[PV_CLOSE]?.value) {
        onStatusUpdate?.(VALVE_STATE.ERROR)

        return VALVE_STATE.ERROR
      }
      if (state[PV_OPEN]?.value && !state[PV_CLOSE]?.value) {
        onStatusUpdate?.(VALVE_STATE.OPEN)
        return VALVE_STATE.OPEN
      }
      if (!state[PV_OPEN]?.value && state[PV_CLOSE]?.value) {
        onStatusUpdate?.(VALVE_STATE.CLOSED)
        return VALVE_STATE.CLOSED
      }
      if (!state[PV_OPEN]?.value && !state[PV_CLOSE]?.value) {
        onStatusUpdate?.(VALVE_STATE.TRANSITIONING)
        return VALVE_STATE.TRANSITIONING
      }
    }
  }, [state, onStatusChange, PV_OPEN, PV_CLOSE, onStatusUpdate])

  if (!isConnected) {
    return <span>N/A</span>
  }

  switch (valveState) {
    case VALVE_STATE.OPEN:
      return (
        <div>
          Valve is <span>OPEN</span>
        </div>
      )
    case VALVE_STATE.CLOSED:
      return (
        <div>
          Valve is <span>CLOSED</span>
        </div>
      )
    case VALVE_STATE.TRANSITIONING:
      return <div>In Transition...</div>
    case VALVE_STATE.ERROR:
      return <span>N/A</span>
    default:
      return <div>Valve state unknown</div>
  }
}

interface ValveProps {
  label: string
}

export const Valve: FC<PropsWithChildren<ValveProps>> = ({
  children,
  label,
}) => {
  return (
    <div className={styles.container}>
      <div className={styles.label}>{label}</div>
      <PolygonIcon />
      <div className={styles.label}>{children}</div>
    </div>
  )
}
