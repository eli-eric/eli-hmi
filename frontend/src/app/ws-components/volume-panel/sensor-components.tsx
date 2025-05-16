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
    <div className={styles.ValueContainer}>
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
    //TODO: Add a more sophisticated speed label
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
    <div className={styles.ValueContainer}>
      <span>{value}</span>
    </div>
  )
}

const ValueUnit: FC<PumpSpeedProps> = ({ data, isConnected }) => {
  const value = isConnected ? data?.value.toFixed(2) : 'N/A'

  return (
    <div className={styles.ValueUnit}>
      <span>{`${value} ${data?.units}`}</span>
    </div>
  )
}

/**
 * Pump speed status component
 */

export const PureValue: FC<PumpSpeedProps> = ({ data, isConnected }) => {
  return (
    <div className={styles.ValueContainer}>
      <span>{isConnected ? data?.value : 'N/A'}</span>
    </div>
  )
}

/**
 * Container for pump components
 */
interface ContainerProps {
  width?: string
  gap?: string
}

export const Container: FC<PropsWithChildren<ContainerProps>> = ({
  children,
  width,
  gap,
}) => {
  return (
    <div className={styles.pumpContainer} style={{ width, gap }}>
      {children}
    </div>
  )
}

/**
 *
 */

const SensorValue: FC<PumpSpeedProps> = ({ data, isConnected }) => {
  const value = isConnected ? data?.value : 'N/A'
  return <span className={styles.sensorValue}>{value}</span>
}

// WebSocket-connected components
export const ValveStatusConnected = withReactWebSocketData(ValveStatus)
export const PumpSpeedConnected = withReactWebSocketData(PumpSpeed)
export const PureValueConnected = withReactWebSocketData(PureValue)
export const ValueUnitConnected = withReactWebSocketData(ValueUnit)
export const SensorValueConnected = withReactWebSocketData(SensorValue)
