'use client'
import { FC, useState } from 'react'
import Dropdown from '@/components/ui/dropdown'
import { SettingsButton } from '@/components/ui/buttons'
// import { useWebSocketContext } from '@/app/providers/socket-provider'
import { VALVE_STATE, ValveStatus } from './Valve'
import styles from '../styles/valve.module.css'

interface ValveControlStatusProps {
  statusOpenPV: string
  statusClosePV: string
  controlOpenPV: string
  controlClosePV: string
}
export const ValveControlStatus: FC<ValveControlStatusProps> = ({
  statusOpenPV,
  statusClosePV,
  controlOpenPV,
  controlClosePV,
}) => {
  const [status, setStatus] = useState<VALVE_STATE>(VALVE_STATE.CLOSED)
  const [fetching, setFetching] = useState(false)
  // const { send } = useWebSocketContext()

  const onStatusUpdate = (newStatus: VALVE_STATE) => {
    if (status !== newStatus) {
      setStatus(newStatus)
    }
  }

  const isDisabled =
    fetching ||
    status === VALVE_STATE.TRANSITIONING ||
    status === VALVE_STATE.ERROR

  return (
    <Dropdown
      renderTrigger={() => (
        <div className={styles.valve__control}>
          <ValveStatus
            onStatusUpdate={onStatusUpdate}
            openPV={statusOpenPV}
            closePV={statusClosePV}
          />
          <SettingsButton disabled={isDisabled} />
        </div>
      )}
      items={
        status === VALVE_STATE.CLOSED
          ? [
              {
                label: 'Open Valve',
                onClick: () => {
                  // send({ type: 'set', pvs: { [controlOpenPV]: true } })
                  setFetching(true)
                  fetch(`${process.env.NEXT_PUBLIC_API_URL}/${controlOpenPV}`, {
                    method: 'PUT',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ value: true }),
                  })
                    .then()
                    .finally(() => {
                      setFetching(false)
                    })
                },
              },
            ]
          : status === VALVE_STATE.OPEN
          ? [
              {
                label: 'Close Valve',
                onClick: () => {
                  // send({ type: 'set', pvs: { [controlClosePV]: true } })
                  setFetching(true)
                  fetch(
                    `${process.env.NEXT_PUBLIC_API_URL}/${controlClosePV}`,
                    {
                      method: 'PUT',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({ value: true }),
                    },
                  )
                    .then()
                    .finally(() => {
                      setFetching(false)
                    })
                },
              },
            ]
          : []
      }
      disabled={isDisabled}
    />
  )
}
