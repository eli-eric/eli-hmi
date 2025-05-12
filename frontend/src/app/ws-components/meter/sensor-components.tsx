'use client'

import { FC, PropsWithChildren } from 'react'
import { Message } from '@/lib/websocket-provider/message'
import { withReactWebSocketData } from '../with-websocket-data'

import styles from './sensor-pump.module.css'

/**
 * Valve open/closed status component
 */
interface ValveStatusProps {
  label?: string
  data?: Message<number> | null
  isConnected?: boolean
}

export const ValveStatus: FC<ValveStatusProps> = ({
  label,
  data,
  isConnected,
}) => {
  const value = isConnected ? (data?.value ? 'open' : 'closed') : 'N/A'

  return (
    <div className={styles.labelContainer}>
      <span>{`Valve ${label} is ${value}`}</span>
    </div>
  )
}

/**
 * Pump speed status component
 */
interface PumpSpeedProps {
  data?: Message<number> | null
  isConnected?: boolean
}

export const PumpSpeed: FC<PumpSpeedProps> = ({ data, isConnected }) => {
  const getSpeedLabel = (value?: number) => {
    if (value === undefined) return 'N/A'
    if (value > 80) return 'Full Speed'
    else if (value > 60) return 'High Speed'
    else if (value > 40) return 'Medium Speed'
    else if (value > 20) return 'Low Speed'
    else if (value > 0) return 'Standby'
    else return 'Off'
  }

  const value = isConnected ? getSpeedLabel(data?.value) : 'N/A'
  
  return (
    <div className={styles.labelContainer}>
      <span>{value}</span>
    </div>
  )
}

/**
 * Container for pump components
 */
export const PumpContainer: FC<PropsWithChildren> = ({ children }) => {
  return <div className={styles.pumpContainer}>{children}</div>
}

// WebSocket-connected components
export const ValveStatusConnected = withReactWebSocketData(ValveStatus)
export const PumpSpeedConnected = withReactWebSocketData(PumpSpeed)
