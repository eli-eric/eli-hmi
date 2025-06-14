'use client'

import React, { createContext, useContext, ReactNode } from 'react'
import { useWebSocket } from '@/hooks/useWebsocket'
import { WebSocketContextValue } from './types'

// Types for context value

// Create context with default values
const WebSocketContext = createContext<WebSocketContextValue | undefined>(
  undefined,
)

// Props for provider component
interface WebSocketProviderProps {
  children: ReactNode
}

// Provider component
export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({
  children,
}) => {
  const websocket = useWebSocket()
  return (
    <WebSocketContext.Provider value={websocket}>
      {children}
    </WebSocketContext.Provider>
  )
}

// Hook for using WebSocket context
export const useWebSocketContext = (): WebSocketContextValue => {
  const context = useContext(WebSocketContext)

  if (context === undefined) {
    throw new Error(
      'useWebSocketContext must be used within a WebSocketProvider',
    )
  }

  return context
}
