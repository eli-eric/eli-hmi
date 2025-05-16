'use client'

import { FC, PropsWithChildren } from 'react'
import { CheckIcon, CloseIcon } from '@/components/ui/icons'
import { withReactWebSocketData } from '../../with-websocket-data'
import { Message } from '@/app/providers/types'
import styles from '../styles/interlocks.module.css'

/**
 * IconsStatus - Displays status icons based on value
 */
const IconsStatus: FC<{
  value?: boolean
  isConnected: boolean
}> = ({ value, isConnected }) => {
  if (isConnected === false) {
    return <span>N/A</span>
  }
  if (value === true) {
    return <CheckIcon />
  }
  if (value === false) {
    return <CloseIcon />
  }
  return <span>N/A</span>
}

/**
 * Props for the InterlockItem component
 */
interface InterlockItemProps {
  /**
   * Data from the WebSocket
   */
  data?: Message<boolean> | null

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
      <IconsStatus value={value} isConnected={isConnected} />
    </div>
  )
}

/**
 * InterLockConnected - Connected interlock item
 *
 * Wraps the InterlockItem with WebSocket data
 */
export const InterlockConnected = withReactWebSocketData(InterlockItem)

/**
 * Interlocks - Container for interlock items
 *
 * Renders children (typically InterlockConnected components)
 * following the compound pattern used in VolumePanel
 */
export const Interlocks: FC<PropsWithChildren> = ({ children }) => {
  return <div className={styles.interlocks__container}>{children}</div>
}
