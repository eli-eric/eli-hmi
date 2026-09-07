'use client'

import React, { createContext, useContext, ReactNode } from 'react'
import { useWebSocket } from '@/lib/websocket/use-websocket'
import { WebSocketContextValue } from './types'

// Types for context value

// Create context with default values. Exported so test helpers can wrap
// components with a controllable provider (see src/test/ws-test-provider.tsx).
export const WebSocketContext = createContext<
  WebSocketContextValue | undefined
>(undefined)

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

/**
 * Transport state for presentational components, safe outside a provider.
 *
 * Readouts deep in the tree need to know whether the backend link is up (a
 * dead link means every value on screen is a stale snapshot), but they are
 * pure components that must still render in isolation — unit tests and
 * Storybook-style usage mount them with no provider at all. Absent a
 * provider there is no transport that could be down, so the honest answer
 * is `true`.
 */
export const useTransportConnected = (): boolean => {
  return useContext(WebSocketContext)?.isConnected ?? true
}
