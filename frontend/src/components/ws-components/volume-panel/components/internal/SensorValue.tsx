import { Message } from '@/app/providers/types'
import WithErrorData from '@/components/ws-components/with-error-data'
import { getFormattedValue, ValueFormatOptions } from '@/lib/utils/pv-helpers'
import { FC } from 'react'
import commonStyles from '../../styles/common.module.css'

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
 * SensorValue - Displays sensor data with appropriate formatting
 */
export const SensorValue: FC<SensorProps> = ({
  label,
  data,
  isConnected,
  options,
}) => {
  return (
    <div className={commonStyles.sensorItem}>
      <div>
        <span className={commonStyles.textBold}>
          <WithErrorData
            data={data}
            formatValue={(v) => getFormattedValue({ value: v, options })}
            isConnected={isConnected}
          />
        </span>
      </div>
      {label && <span className={commonStyles.textNormal}>{label}</span>}
    </div>
  )
}
