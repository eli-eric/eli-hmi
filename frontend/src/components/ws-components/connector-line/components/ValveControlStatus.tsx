import { FC, useState } from 'react'
import Dropdown from '@/components/ui/dropdown'
import { SettingsButton } from '@/components/ui/buttons'
import { useWebSocketContext } from '@/app/providers/socket-provider'
import { VALVE_STATE, ValveStatus } from './Valve'
import styles from '../styles/valve.module.css'

interface ValveControlStatusProps {
  statusPvs: string[]
  controlPvs: string[]
}
export const ValveControlStatus: FC<ValveControlStatusProps> = ({
  statusPvs,
  controlPvs,
}) => {
  const [status, setStatus] = useState<VALVE_STATE>(VALVE_STATE.CLOSED)
  const { send } = useWebSocketContext()

  const onStatusUpdate = (newStatus: VALVE_STATE) => {
    setStatus(newStatus)
  }

  const isDisabled =
    status === VALVE_STATE.TRANSITIONING || status === VALVE_STATE.ERROR

  return (
    <Dropdown
      renderTrigger={() => (
        <div className={styles.valve__control}>
          <ValveStatus onStatusUpdate={onStatusUpdate} pvNames={statusPvs} />
          <SettingsButton disabled={isDisabled} />
        </div>
      )}
      items={
        status === VALVE_STATE.CLOSED
          ? [
              {
                label: 'Open Valve',
                onClick: () => {
                  send({ pvname: controlPvs[0], value: 1 })
                },
              },
            ]
          : status === VALVE_STATE.OPEN
          ? [
              {
                label: 'Close Valve',
                onClick: () => {
                  send({ pvname: controlPvs[1], value: 0 })
                },
              },
            ]
          : []
      }
      disabled={isDisabled}
    />
  )
}
