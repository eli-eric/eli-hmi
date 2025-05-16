'use client'

import { FC } from 'react'
import styles from '../styles/sensors.module.css'
import volumeStyles from '../styles/volume-panel.module.css'
import { Message } from '@/app/providers/types'

/**
 * Common props for sensor components
 */
export interface SensorProps {
  /**
   * Optional label for the sensor
   */
  label?: string

  /**
   * Data from the WebSocket
   */
  data?: Message<number> | null

  /**
   * Whether the WebSocket is connected
   */
  isConnected?: boolean
}

/**
 * SensorPressure - Displays pressure sensor data
 */
export const SensorPressure: FC<SensorProps> = ({
  label,
  data,
  isConnected,
}) => {
  const value = isConnected ? data?.value.toExponential(2) : 'N/A'
  const unit = data?.units || 'N/A'

  return (
    <div className={volumeStyles.volumePanel__sensor}>
      <span
        className={volumeStyles.volumePanel__sensorData}
      >{`${value} ${unit}`}</span>
      <span className={volumeStyles.volumePanel__sensorLabel}>{label}</span>
    </div>
  )
}

/**
 * ValveStatus - Displays valve open/closed status
 */
export const ValveStatus: FC<SensorProps> = ({ label, data, isConnected }) => {
  const value = isConnected ? (data?.value ? 'open' : 'closed') : 'N/A'

  return (
    <div className={styles.sensor__valueContainer}>
      <span>{`Valve ${label} is ${value}`}</span>
    </div>
  )
}

/**
 * PumpSpeed - Displays pump speed status
 */
export const PumpSpeed: FC<SensorProps> = ({ data, isConnected }) => {
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
    <div className={styles.sensor__valueContainer}>
      <span>{value}</span>
    </div>
  )
}

/**
 * ValueUnit - Displays a value with its unit
 */
export const ValueUnit: FC<SensorProps> = ({ data, isConnected }) => {
  const value = isConnected ? data?.value.toFixed(2) : 'N/A'

  return (
    <div className={styles.sensor__valueUnit}>
      <span>{`${value} ${data?.units}`}</span>
    </div>
  )
}

/**
 * PureValue - Displays a raw value
 */
export const PureValue: FC<SensorProps> = ({ data, isConnected }) => {
  return (
    <div className={styles.sensor__valueContainer}>
      <span>{isConnected ? data?.value : 'N/A'}</span>
    </div>
  )
}

/**
 * SensorValue - Displays a sensor value
 */
export const SensorValue: FC<SensorProps> = ({ data, isConnected }) => {
  const value = isConnected ? data?.value : 'N/A'
  return <span className={styles.sensor__value}>{value}</span>
}
