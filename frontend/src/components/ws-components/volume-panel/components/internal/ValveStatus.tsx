import { Message } from '@/app/providers/types'
import WithErrorData from '@/components/ws-components/with-error-data'
import styles from './ValveStatus.module.css'
import { FC } from 'react'

interface ValveStatusProps {
  label: string
  data?: Message<1 | 0 | null> | null
  isConnected?: boolean
}

/**
 * ValveStatus - Displays valve open/closed status
 */
export const ValveStatus: FC<ValveStatusProps> = ({
  label,
  data,
  isConnected,
}) => {
  const getValue = (value: number | null | undefined) => {
    switch (value) {
      case 1:
        return 'OPEN'
      case 0:
        return 'CLOSED'
      case null:
        return 'N/A'
      default:
        return 'N/A'
    }
  }

  const value = isConnected ? getValue(data?.value) : 'N/A'

  return (
    <div className={styles.valveStatus__container}>
      <WithErrorData data={data} isConnected={isConnected}>
        <span>{`Valve ${label} is ${value}`}</span>
      </WithErrorData>
    </div>
  )
}
