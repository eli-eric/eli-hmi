'use client'

import styles from './status-bar.module.css'
import { StatusBarMessage } from './status-bar.message'
import { StatusBarIcon } from './status-bar.icon'
import { useWebSocketContext } from '@/app/providers/socket-provider'

export const StatusBar = () => {
  const {
    isConnected,
    connectionState: {},
  } = useWebSocketContext()

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
          <span className={styles.headerText}>System Status</span>
          {/* <ReconnectButton /> */}
        </div>
        <StatusBarIcon isConnected={isConnected} />
      </div>
      {!isConnected && <StatusBarMessage />}
    </div>
  )
}
