import Dropdown from '@/components/ui/dropdown'
import { FC, useState } from 'react'
import { VALVE_STATE, ValveStatus } from './valve'
import { SettingsButton } from '@/components/ui/buttons'
import { useWebSocket } from '@/lib/websocket-provider/useWebsocket'
import { useWebSocketContext } from '@/app/providers/socket-provider'

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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0.5rem',
            gap: '0.5rem',
          }}
        >
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
