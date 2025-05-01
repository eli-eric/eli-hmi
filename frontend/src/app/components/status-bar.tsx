'use client'

import { useWebSocketProvider } from '../providers/socket-provider'
import { CheckIcon } from '@/components/ui/icons/check-icon'
import { CloseIcon } from '@/components/ui/icons/close-icon'

export const StatusBar = () => {
  const ws = useWebSocketProvider()
  return (
    <div className="status-bar-container">
      <div className="status-bar-content">
        <div className="status-bar-header">
          <span>System Status</span>
        </div>
        <div className="status-bar-body">
          <span>WebSocket Connection</span>
          {ws.isConnected ? <CheckIcon /> : <CloseIcon />}
        </div>
      </div>
    </div>
  )
}
