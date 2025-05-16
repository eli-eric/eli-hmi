import { ClearButton, SettingsButton } from '@/components/ui/buttons'
import Dropdown from '@/components/ui/dropdown'
import styles from './state-control.module.css'
import { useWebSocketMulti } from '@/hooks/useWebSocketData'
import { FC } from 'react'

//TODO PV Logic and state transitions
export const StateControl = () => {
  const renderTrigger = () => {
    return (
      <div className={styles.trigger} style={{ backgroundColor: '#D9D9D9' }}>
        <div className={styles.triggerContainer}>
          <span>High Vaccum</span>
          <SettingsButton />
        </div>
      </div>
    )
  }

  return (
    <Dropdown
      items={[
        { label: 'Standby' },
        { label: 'Vented' },
        { label: 'Rough Vacuum' },
      ]}
      renderTrigger={renderTrigger}
    />
  )
}

interface WarningErrorControlProps {
  PVs: string[]
}

export const WarningErrorControl: FC<WarningErrorControlProps> = ({ PVs }) => {
  const { isConnected, state } = useWebSocketMulti<boolean>({ pvs: PVs })

  const warning = isConnected
    ? state[PVs[0]]?.value === false
      ? 'no'
      : 'yes'
    : 'N/A'
  const error = isConnected
    ? state[PVs[1]]?.value === false
      ? 'no'
      : 'yes'
    : 'N/A'
  return (
    <div className={styles.warningContainer}>
      <div className={styles.warningBox}>
        <span>{`Warning: ${warning}`}</span>
        <span>{`Error: ${error}`}</span>
      </div>
      <div>
        <ClearButton disabled />
      </div>
    </div>
  )
}
