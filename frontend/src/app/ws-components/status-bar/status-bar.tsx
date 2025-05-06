'use client'

import styles from './status-bar.module.css'
import { useWebSocketProvider } from '@/app/providers/socket-provider'
import { StatusBarMessage } from './status-bar.message'
import { StatusBarIcon } from './status-bar.icon'

export const StatusBar = () => {
  const { isConnected, connectionAttempt } = useWebSocketProvider()
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
          <span className={styles.headerText}>System Status</span>
        </div>
        <StatusBarIcon isConnected={isConnected} />
      </div>
      {!isConnected && <StatusBarMessage attempt={connectionAttempt} />}
    </div>
  )
}
