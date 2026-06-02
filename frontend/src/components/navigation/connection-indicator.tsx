'use client'

import { CheckIcon, CloseIcon } from '@/components/ui/icons'
import { useWebSocketContext } from '@/app/providers/socket-provider'
import styles from './connection-indicator.module.css'

/**
 * Compact System Status surfaced in the top navigation bar — the single
 * connection-status indicator for the app (the old sidebar `StatusBar` was
 * removed to avoid duplicate status and reclaim horizontal space). Lets
 * operators see at a glance whether live WebSocket values are flowing; on the
 * L4 OPCPA page a disconnect banner adds detail.
 *
 * `role="status"` makes screen readers announce connect/disconnect changes.
 */
export const ConnectionIndicator = () => {
  const { isConnected } = useWebSocketContext()
  return (
    <span
      className={styles.indicator}
      role="status"
      data-connected={isConnected}
      aria-label={`System status: WebSocket ${
        isConnected ? 'connected' : 'disconnected'
      }`}
    >
      {isConnected ? <CheckIcon /> : <CloseIcon />}
      <span className={styles.text} aria-hidden="true">
        {isConnected ? 'Online' : 'Offline'}
      </span>
    </span>
  )
}
