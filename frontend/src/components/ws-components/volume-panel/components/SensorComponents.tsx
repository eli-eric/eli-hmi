'use client'

import { FC } from 'react'
import styles from '../styles/sensors.module.css'
import volumeStyles from '../styles/volume-panel.module.css'
import { Message } from '@/app/providers/types'
import { WithErrorData } from '../../with-error-data'
import { getFormattedValue, ValueFormatOptions } from '@/lib/utils/pv-helpers'

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

  /**
   * Optional format enum for formatting the sensor value
   */

  options?: ValueFormatOptions
}

/**
 * SensorPressure - Displays pressure sensor data
 */
export const SensorPressure: FC<SensorProps> = ({
  label,
  data,
  isConnected,
  options,
}) => {
  return (
    <div className={volumeStyles.volumePanel__sensor}>
      <div>
        <span className={volumeStyles.volumePanel__sensorData}>
          <WithErrorData
            data={data}
            formatValue={(v) => getFormattedValue({ value: v, options })}
            isConnected={isConnected}
          />
        </span>
      </div>
      <span className={volumeStyles.volumePanel__sensorLabel}>{label}</span>
    </div>
  )
}

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
    <div className={styles.sensor__valueContainer}>
      <WithErrorData data={data} isConnected={isConnected}>
        <span>{`Valve ${label} is ${value}`}</span>
      </WithErrorData>
    </div>
  )
}

/**
 * PumpSpeed - Displays pump speed status
 */
export const PumpSpeed: FC<SensorProps> = ({ data, isConnected }) => {
  const getSpeedLabel = (value: number) => {
    if (value > 80) return 'Full Speed'
    else if (value > 60) return 'High Speed'
    else if (value > 40) return 'Medium Speed'
    else if (value > 20) return 'Low Speed'
    else if (value > 0) return 'Standby'
    else return 'Off'
  }

  return (
    <div className={styles.sensor__valueContainer}>
      <WithErrorData
        data={data}
        isConnected={isConnected}
        formatValue={getSpeedLabel}
      />
    </div>
  )
}

/**
 * ValueUnit - Displays a value with its unit
 */
export const ValueUnit: FC<SensorProps> = ({ data, isConnected }) => {
  return (
    <div className={styles.sensor__valueUnit}>
      <WithErrorData
        data={data}
        isConnected={isConnected}
        formatValue={(v) => v.toPrecision(2)}
      />
    </div>
  )
}

/**
 * PureValue - Displays a raw value
 */
export const PureValue: FC<SensorProps> = ({ data, isConnected }) => {
  return (
    <div className={styles.sensor__valueContainer}>
      <WithErrorData data={data} isConnected={isConnected} />
    </div>
  )
}

/**
 * SensorValue - Displays a sensor value
 */
export const SensorValue: FC<SensorProps> = ({
  data,
  isConnected,
  options,
}) => {
  const value = isConnected
    ? getFormattedValue({
        value: data?.value,
        options,
      }) || 'N/A'
    : 'N/A'

  return <span className={styles.sensor__value}>{value}</span>
}
