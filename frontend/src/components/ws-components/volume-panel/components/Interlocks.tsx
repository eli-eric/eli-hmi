'use client'

import { FC, PropsWithChildren } from 'react'
import { CheckIcon, CloseIcon } from '@/components/ui/icons'
import { withReactWebSocketData } from '../../with-websocket-data'
import { Message } from '@/app/providers/types'
import styles from '../styles/interlocks.module.css'
import { WithErrorData } from '../../with-error-data'
import { getPrefixedPV } from '@/lib/utils/pv-helpers'

/**
 * IconsStatus - Displays status icons based on value
 */
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

/**
 * Props for the InterlockItem component
 */
interface InterlockItemProps {
  /**
   * Data from the WebSocket
   */
  data?: Message<1 | 0 | null>

  /**
   * Title of the interlock
   */
  title: string

  /**
   * Whether the WebSocket is connected
   */
  isConnected?: boolean
}

/**
 * InterlockItem - Individual interlock item
 *
 * Displays an interlock with its status
 */
export const InterlockItem: FC<InterlockItemProps> = ({
  title,
  data,
  isConnected = false,
}) => {
  const value = data?.value
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

const InterlockConnectedIntern = withReactWebSocketData(InterlockItem)

interface InterlockConnectedProps {
  pvname: string
  title: string
}
/**
 * InterLockConnected - Connected interlock item
 *
 * Wraps the InterlockItem with WebSocket data
 */
export const InterlockConnected = ({
  title,
  pvname,
}: InterlockConnectedProps) => {
  return (
    <InterlockConnectedIntern title={title} pvname={getPrefixedPV(pvname)} />
  )
}

/**
 * Interlocks - Container for interlock items
 *
 * Renders children (typically InterlockConnected components)
 * following the compound pattern used in VolumePanel
 */
export const Interlocks: FC<PropsWithChildren> = ({ children }) => {
  return <div className={styles.interlocks__container}>{children}</div>
}
