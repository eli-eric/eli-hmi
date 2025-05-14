import Dropdown from '@/components/ui/dropdown'
import { FC, useState } from 'react'
import { VALVE_STATE, ValveStatus } from './valve'
import { SettingsButton } from '@/components/ui/buttons'

interface ValveControlStatusProps {
  statusPvs: string[]
  controlPvs: string[]
}
export const ValveControlStatus: FC<ValveControlStatusProps> = ({
  statusPvs,
}) => {
  const [status, setStatus] = useState<VALVE_STATE>(VALVE_STATE.CLOSED)

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
            backgroundColor: isDisabled ? 'transparent' : '#B8B8B8',
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
                  console.log('Open Valve clicked')
                },
              },
            ]
          : status === VALVE_STATE.OPEN
          ? [
              {
                label: 'Close Valve',
                onClick: () => {
                  console.log('Close Valve clicked')
                },
              },
            ]
          : []
      }
      disabled={isDisabled}
    />
  )
}
