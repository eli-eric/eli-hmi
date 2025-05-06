'use client'

import { CheckIcon, CloseIcon } from '@/components/ui/icons'
import styles from './status-bar.module.css'
import { useWebSocketProvider } from '@/app/providers/socket-provider'

export const StatusBar = () => {
  const ws = useWebSocketProvider()
  console.log('StatusBar', ws.isConnected)
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
          <span className={styles.headerText}>System Status</span>
        </div>
        <div className={styles.body}>
          <span className={styles.bodyText}>WebSocket Connection</span>
          {ws.isConnected ? <CheckIcon /> : <CloseIcon />}
        </div>
      </div>
    </div>
  )
}
