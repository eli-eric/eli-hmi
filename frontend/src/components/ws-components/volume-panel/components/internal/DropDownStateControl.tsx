'use client'

import { FC } from 'react'
import { SettingsButton } from '@/components/ui/buttons'
import Dropdown from '@/components/ui/dropdown'
import { useWebSocketMulti } from '@/hooks/useWebSocketData'
import styles from './DropDownStateControl.module.css'
import { Message } from '@/app/providers/types'
import Image from 'next/image'
import { API_URL } from '@/types/constants'

type TriggerProps = {
  currentStatePv: string
  targetStatePv: string
}

const Trigger = ({ currentStatePv, targetStatePv }: TriggerProps) => {
  const { state } = useWebSocketMulti({
    pvs: [targetStatePv, currentStatePv],
  })

  const currentState = state[currentStatePv] as Message<string> | null
  const currentValue = currentState?.value || 'N/A'
  const targetState = state[targetStatePv] as Message<string> | null
  const targetValue = targetState?.value || 'N/A'

  const showTarget = targetValue !== currentValue

  return (
    <div
      className={styles.control__trigger}
      style={{ backgroundColor: 'var(--color-surface-light)' }}
    >
      <div className={styles.control__triggerContainer}>
        <div className={styles.control__triggerStatus}>
          <span className={styles.control__triggerContainerText}>
            {currentValue}
          </span>
          {showTarget && (
            <div className={styles.control__targetContainer}>
              <Image
                src={'/images/arrow-right.svg'}
                alt="Target Icon"
                width={16}
                height={16}
                className={styles.control__targetIcon}
              />
              <span className={styles.control__targetLabel}>{targetValue}</span>
            </div>
          )}
        </div>
        <SettingsButton />
      </div>
    </div>
  )
}

interface ControlProps {
  pvNameCurrent: string
  pvNameTarget: string
  controlPvs: {
    pvName: string
    label: string
  }[]
}

/**
 * StateControl - Dropdown control for volume state
 *
 * Displays a dropdown with state options and a settings button
 *
 * @param pvNameCurrent - PV name for the current state
 * @param pvNameTarget - PV name for the target state
 * @param controlPvs - Array of control PVs with names and labels
 * @returns JSX.Element
 */
export const DropDownStateControl: FC<ControlProps> = ({
  controlPvs,
  pvNameCurrent,
  pvNameTarget,
}) => {
  const renderTrigger = () => {
    return (
      <Trigger
        currentStatePv={pvNameCurrent || 'SI_DUMMY'}
        targetStatePv={pvNameTarget || 'SI_DUMMY'}
      />
    )
  }

  return (
    <Dropdown
      items={
        controlPvs?.map((control) => ({
          label: control.label,
          onClick: () => {
            // Handle control item click
            console.log(`${API_URL}/${control.pvName}`)
            fetch(`${API_URL}/${control.pvName}`, {
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
