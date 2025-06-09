'use client'

import { FC } from 'react'
import { ClearButton, SettingsButton } from '@/components/ui/buttons'
import Dropdown from '@/components/ui/dropdown'
import { useWebSocketMulti } from '@/hooks/useWebSocketData'
import styles from '../styles/controls.module.css'
import { Message } from '@/app/providers/types'
import { withReactWebSocketData } from '@/components/ws-components/with-websocket-data'

type TriggerProps = {
  data?: Message<string> | null
  isConnected?: boolean
}

const Trigger = ({ data }: TriggerProps) => {
  return (
    <div
      className={styles.control__trigger}
      style={{ backgroundColor: 'var(--color-surface-light)' }}
    >
      <div className={styles.control__triggerContainer}>
        <span>{data?.value}</span>
        <SettingsButton />
      </div>
    </div>
  )
}

const ConnectedTrigger = withReactWebSocketData(Trigger)

interface ControlProps {
  pvName?: string
  controlPvs?: {
    pvName: string
    label: string
  }[]
}

/**
 * StateControl - Dropdown control for volume state
 *
 * Displays a dropdown with state options and a settings button
 */
//TODO
export const StateControl: FC<ControlProps> = ({ pvName, controlPvs }) => {
  const renderTrigger = () => {
    return <ConnectedTrigger pvname={pvName || 'SI_DUMMY'} />
  }

  return (
    <Dropdown
      items={
        controlPvs?.map((control) => ({
          label: control.label,
          onClick: () => {
            // Handle control item click
            console.log(`${process.env.NEXT_PUBLIC_API_URL}/${control.pvName}`)
            fetch(`${process.env.NEXT_PUBLIC_API_URL}/${control.pvName}`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ value: 1, type: 'short' }),
            })
          },
        })) || []
      }
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
