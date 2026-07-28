'use client'

import { FC } from 'react'
import Image from 'next/image'

import { SettingsButton } from '@/components/ui/buttons'
import Dropdown from '@/components/ui/dropdown'
import { useWebSocketData } from '@/lib/websocket/use-websocket-data'
import { getPrefixedPV } from '@/lib/utils/pv-helpers'
import { Message } from '@/app/providers/types'
import { useRuntimeConfig } from '@/lib/runtime-config/context'

import commonStyles from '../../styles/common.module.css'

type TriggerProps = {
  currentStatePv: string
  targetStatePv: string
}

const Trigger = ({ currentStatePv, targetStatePv }: TriggerProps) => {
  const { byPv } = useWebSocketData({
    pvs: [targetStatePv, currentStatePv],
  })

  const currentState = byPv(currentStatePv) as Message<string> | null
  const currentValue = currentState?.value || 'N/A'
  const targetState = byPv(targetStatePv) as Message<string> | null
  const targetValue = targetState?.value || 'N/A'

  const showTarget = targetValue !== currentValue

  return (
    <div
      className={commonStyles.dropdownTrigger}
      style={{ backgroundColor: 'var(--color-surface-light)' }}
    >
      <div className={commonStyles.flexBetween}>
        <div className={commonStyles.flexColumn}>
          <span className={commonStyles.textBold}>{currentValue}</span>
          {showTarget && (
            <div className={commonStyles.targetContainer}>
              <Image
                src={'/images/arrow-right.svg'}
                alt="Target Icon"
                width={16}
                height={16}
                className={commonStyles.targetIcon}
              />
              <span className={commonStyles.textNormal}>{targetValue}</span>
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
 * Dropdown that shows current/target state and POSTs to a control PV on click.
 *
 * Caller passes logical PV names; the read side resolves prefix via the hook,
 * the write side (`fetch`) calls {@link getPrefixedPV} explicitly.
 */
export const DropDownStateControl: FC<ControlProps> = ({
  controlPvs,
  pvNameCurrent,
  pvNameTarget,
}) => {
  const { apiUrl } = useRuntimeConfig()

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
            fetch(`${apiUrl}/${getPrefixedPV(control.pvName)}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ value: 1, type: 'short' }),
            })
          },
        })) || []
      }
      renderTrigger={renderTrigger}
    />
  )
}
