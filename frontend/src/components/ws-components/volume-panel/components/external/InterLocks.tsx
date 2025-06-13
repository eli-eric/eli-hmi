'use client'

import { FC } from 'react'
import { CheckIcon, CloseIcon } from '@/components/ui/icons'
import styles from './InterLocks.module.css'
import { getPrefixedPV } from '@/lib/utils/pv-helpers'
import WithErrorData from '@/components/ws-components/with-error-data'
import { useWebSocketMulti } from '@/hooks/useWebSocketData'
import { VolumeCard } from '../internal/VolumeCard'

/**
 * Props for the IconsStatus component
 */
interface IconsStatusProps {
  /** The value to display (1 = check, 0 = cross, null/undefined = nothing) */
  value?: 1 | 0 | null
}

/**
 * IconsStatus - Displays a check or cross icon based on the interlock value
 */
const IconsStatus: FC<IconsStatusProps> = ({ value }) => {
  if (value === 1) {
    return <CheckIcon />
  }
  if (value === 0) {
    return <CloseIcon />
  }
  return null
}

/**
 * Props for the InterlockItem component
 */
interface InterlockItemProps {
  /** The PV name for the interlock */
  pvname: string
  /** The display title for the interlock */
  title: string
}

/**
 * InterlockItem - Displays a single interlock item with status
 */
const InterlockItem: FC<InterlockItemProps> = ({ title, pvname }) => {
  const { state, isConnected } = useWebSocketMulti<1 | 0 | null>({
    pvs: [pvname],
  })
  const data = state[pvname]
  const value = state[pvname]?.value
  return (
    <div className={styles.interlocks__item}>
      <span>{title}</span>
      <div>
        <WithErrorData data={data} isConnected={isConnected}>
          <IconsStatus value={value} />
        </WithErrorData>
      </div>
    </div>
  )
}

/**
 * Props for the InterlockConnected component
 */
interface InterlockConnectedProps {
  /** The PV name for the interlock */
  pvname: string
  /** The display title for the interlock */
  title: string
}

/**
 * Props for the Interlocks component
 */
interface InterlocksProps {
  /** Array of interlock PVs to display */
  interlocksPVs?: InterlockConnectedProps[]
}

/**
 * Interlocks component
 *
 * Displays a group of system interlocks with visual status indicators.
 * Each interlock shows a check icon (✓) when active/OK or a cross icon (✗) when inactive/error.
 *
 * @example
 * ```tsx
 * <Interlocks
 *   interlocksPVs={[
 *     { pvname: "DOOR_INTERLOCK", title: "Door Interlock" },
 *     { pvname: "PRESSURE_INTERLOCK", title: "Pressure Interlock" }
 *   ]}
 * />
 * ```
 * @returns {JSX.Element} The rendered interlocks component
 */
export const Interlocks: FC<InterlocksProps> = ({ interlocksPVs }) => {
  return (
    <div>
      <div className={styles.interlocks__container}>
        <VolumeCard height="20rem">
          {interlocksPVs?.map((interlock, index) => (
            <InterlockItem
              key={index}
              title={interlock.title}
              pvname={getPrefixedPV(interlock.pvname)}
            />
          ))}
        </VolumeCard>
      </div>
    </div>
  )
}
