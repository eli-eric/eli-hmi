'use client'

import { FC } from 'react'

import { CheckIcon, CloseIcon } from '@/components/ui/icons'
import { useWebSocketData } from '@/lib/websocket/use-websocket-data'
import { PVDisplay } from '@/lib/websocket/pv-display'

import { VolumeCard } from '../internal/VolumeCard'

import styles from './InterLocks.module.css'

const IconsStatus: FC<{ value?: 1 | 0 | null }> = ({ value }) => {
  if (value === 1) return <CheckIcon />
  if (value === 0) return <CloseIcon />
  return null
}

interface InterlockItemProps {
  pvname: string
  title: string
}

const InterlockItem: FC<InterlockItemProps> = ({ title, pvname }) => {
  const { data, isConnected } = useWebSocketData<1 | 0 | null>(pvname)
  return (
    <div className={styles.interlocks__item}>
      <span>{title}</span>
      <div>
        <PVDisplay data={data} isConnected={isConnected}>
          <IconsStatus value={data?.value} />
        </PVDisplay>
      </div>
    </div>
  )
}

interface InterlocksProps {
  interlocksPVs?: { pvname: string; title: string }[]
}

/**
 * Group of interlock items rendered with check/cross icons.
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
              pvname={interlock.pvname}
            />
          ))}
        </VolumeCard>
      </div>
    </div>
  )
}
