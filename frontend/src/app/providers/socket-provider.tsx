'use client'

import React, { createContext, useContext, ReactNode } from 'react'
import { useWebSocket } from '@/lib/websocket/use-websocket'
import { WebSocketContextValue } from './types'

// Types for context value

// Create context with default values. Exported so test helpers can wrap
// components with a controllable provider (see src/test/ws-test-provider.tsx).
export const WebSocketContext = createContext<WebSocketContextValue | undefined>(
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
