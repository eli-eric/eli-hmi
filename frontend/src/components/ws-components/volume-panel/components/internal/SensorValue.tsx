import { Message } from '@/app/providers/types'
import WithErrorData from '@/components/ws-components/with-error-data'
import { getFormattedValue, ValueFormatOptions } from '@/lib/utils/pv-helpers'
import { FC } from 'react'
import volumeStyles from './SensorValue.module.css'
/**
 * Common props for sensor components
 */
export interface SensorProps {
  label?: string

  data?: Message<number> | null

  isConnected?: boolean
  options?: ValueFormatOptions
}

/**
 * SensorPressure - Displays pressure sensor data
 */
export const SensorValue: FC<SensorProps> = ({
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
