import { Message } from '@/app/providers/types'

import { FC, PropsWithChildren } from 'react'

import style from './sensor-pump.module.css'
import { withReactWebSocketData } from '../with-websocket-data'

interface SensorPumpOpenProps {
  label?: string
  data?: Message<number> | null
  isConnected?: boolean
}

const SensorPumpOpen: FC<SensorPumpOpenProps> = ({
  label,
  data,
  isConnected,
}) => {
  const value = isConnected ? (data?.value ? 'open' : 'closed') : 'N/A'

  return (
    <div className={style.labelContainer}>
      <span>{`Valve ${label} is ${value}`}</span>
    </div>
  )
}
interface SensorPumpSpeedProps {
  data?: Message<number> | null
  isConnected?: boolean
}
const SensorPumpSpeed: FC<SensorPumpSpeedProps> = ({ data, isConnected }) => {
  const getValue = (value?: number) => {
    if (value === undefined) return 'N/A'
    if (value > 80) return 'Full Speed'
    else if (value > 60) return 'High Speed'
    else if (value > 40) return 'Medium Speed'
    else if (value > 20) return 'Low Speed'
    else if (value > 0) return 'Standby'
    else return 'Off'
  }

  const value = isConnected ? getValue(data?.value) : 'N/A'
  return (
    <div className={style.labelContainer}>
      <span>{`${value}`}</span>
    </div>
  )
}

export const Container: FC<PropsWithChildren> = ({ children }) => {
  return <div className={style.pumpContainer}>{children}</div>
}

export const SensorPumpSpeedPV = withReactWebSocketData(SensorPumpSpeed)
export const SensorPumpOpenPV = withReactWebSocketData(SensorPumpOpen)
