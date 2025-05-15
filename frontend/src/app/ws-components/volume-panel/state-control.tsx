import { SettingsButton } from '@/components/ui/buttons'
import Dropdown from '@/components/ui/dropdown'
import styles from './state-control.module.css'

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
