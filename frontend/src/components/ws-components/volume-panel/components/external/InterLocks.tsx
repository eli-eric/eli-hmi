'use client'

import { FC } from 'react'
import { CheckIcon, CloseIcon } from '@/components/ui/icons'
import styles from './InterLocks.module.css'
import { getPrefixedPV } from '@/lib/utils/pv-helpers'
import WithErrorData from '@/components/ws-components/with-error-data'
import { useWebSocketMulti } from '@/hooks/useWebSocketData'
import { VolumeCard } from '../internal/VolumeCard'

const IconsStatus: FC<{
  value?: 1 | 0 | null
}> = ({ value }) => {
  if (value === 1) {
    return <CheckIcon />
  }
  if (value === 0) {
    return <CloseIcon />
  }
}

interface InterlockItemProps {
  pvname: string
  title: string
}

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

interface InterlockConnectedProps {
  pvname: string
  title: string
}

interface InterlocksProps {
  interlocksPVs?: InterlockConnectedProps[]
}

/**
 * Interlocks - Container for interlock items
 *
 * Renders children (typically InterlockConnected components)
 * following the compound pattern used in VolumePanel
 * * @interface InterlocksProps
 * @property {InterlockConnectedProps[]} [interlocksPVs] - Array of interlock PVs to render
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
