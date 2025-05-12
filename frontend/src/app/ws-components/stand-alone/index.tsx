import { PolygonIcon } from '@/components/ui/icons'
import { State, useWebSocketMulti } from '@/hooks/useWebSocketData'

import styles from './su.module.css'
import { useMemo } from 'react'

interface SUValveStatusProps {
  pvNames: string[]
  label: string
  onStatusChange?: (status: State<boolean>) => boolean
}

export const SUValveStatus = ({
  pvNames,
  label,
  onStatusChange,
}: SUValveStatusProps) => {
  const { state, isConnected } = useWebSocketMulti<boolean>({
    pvs: pvNames,
    onDataUpdate: (data) => {
      console.log('SU Valve Status Data Update', data)
    },
  })
  const isOpen = useMemo(() => {
    if (onStatusChange) {
      return onStatusChange(state)
    }
    return pvNames.every((pv) => state[pv]?.value === true)
  }, [state, pvNames, onStatusChange])

  return (
    <div className={styles.container}>
      <div className={styles.label}>{label}</div>
      <PolygonIcon />
      <div className={styles.label}>
        {isConnected ? (
          <div>
            Valve is <span>{isOpen ? 'OPEN' : 'CLOSED'}</span>
          </div>
        ) : (
          <span>N/A</span>
        )}
      </div>
    </div>
  )
}
