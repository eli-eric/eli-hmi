'use client'

import { FC } from 'react'
import { ClearButton, SettingsButton } from '@/components/ui/buttons'
import Dropdown from '@/components/ui/dropdown'
import { useWebSocketMulti } from '@/hooks/useWebSocketData'
import styles from '../styles/controls.module.css'

/**
 * StateControl - Dropdown control for volume state
 *
 * Displays a dropdown with state options and a settings button
 */
export const StateControl: FC = () => {
  const renderTrigger = () => {
    return (
      <div
        className={styles.control__trigger}
        style={{ backgroundColor: 'var(--color-surface-light)' }}
      >
        <div className={styles.control__triggerContainer}>
          <span>High Vacuum</span>
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

/**
 * Props for the WarningErrorControl component
 */
interface WarningErrorControlProps {
  /**
   * Array of PV names to monitor for warnings and errors
   */
  PVs: string[]
}

/**
 * WarningErrorControl - Displays warning and error status
 *
 * Shows warning and error status based on PV values
 */
export const WarningErrorControl: FC<WarningErrorControlProps> = ({ PVs }) => {
  const { isConnected, state } = useWebSocketMulti<1 | 0 | null>({ pvs: PVs })

  const warning = isConnected
    ? state[PVs[0]]?.value === 0
      ? 'no'
      : 'yes'
    : 'N/A'
  const error = isConnected
    ? state[PVs[1]]?.value === 0
      ? 'no'
      : 'yes'
    : 'N/A'

  return (
    <div className={styles.control__warningContainer}>
      <div className={styles.control__warningBox}>
        <span>{`Warning: ${warning}`}</span>
        <span>{`Error: ${error}`}</span>
      </div>
      <div>
        <ClearButton disabled />
      </div>
    </div>
  )
}
