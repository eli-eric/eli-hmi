'use client'

import Image from 'next/image'
import { useWebSocketProvider } from '../providers/socket-provider'

export const StatusBar = () => {
  const ws = useWebSocketProvider()
  return (
    <div className="status-bar-container">
      <div className="status-bar-content">
        <div className="status-bar-header">
          <span>System Status</span>
        </div>
        <div className="status-bar-body">
          <div className="status-bar-item">
            <span>WebSocket connection</span>
            <Image
              className="icon"
              width={50}
              height={50}
              src={ws.isConnected ? './check_icon.svg' : './close_icon.svg'}
              alt="Check Icon"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
