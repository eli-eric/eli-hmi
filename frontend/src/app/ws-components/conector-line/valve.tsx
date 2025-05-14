import { PolygonIcon } from '@/components/ui/icons'
import { State, useWebSocketMulti } from '@/hooks/useWebSocketData'

import styles from './valve.module.css'
import { FC, PropsWithChildren, useMemo } from 'react'

interface SUValveStatusProps {
  pvNames: string[]
  onStatusChange?: (
    status: State<boolean>,
  ) => 'OPEN' | 'CLOSED' | 'TRANSITIONING' | 'ERROR'
}

export const ValveStatus = ({
  pvNames,
  onStatusChange,
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
      if (state[PV_OPEN]?.value && state[PV_CLOSE]?.value) return 'ERROR'
      if (state[PV_OPEN]?.value && !state[PV_CLOSE]?.value) return 'OPEN'
      if (!state[PV_OPEN]?.value && state[PV_CLOSE]?.value) return 'CLOSED'
      if (!state[PV_OPEN]?.value && !state[PV_CLOSE]?.value)
        return 'TRANSITIONING'
    }
  }, [state, onStatusChange, PV_OPEN, PV_CLOSE])

  if (!isConnected) {
    return <span>N/A</span>
  }

  switch (valveState) {
    case 'OPEN':
      return (
        <div>
          Valve is <span>OPEN</span>
        </div>
      )
    case 'CLOSED':
      return (
        <div>
          Valve is <span>CLOSED</span>
        </div>
      )
    case 'TRANSITIONING':
      return <div>In Transition...</div>
    case 'ERROR':
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
