'use client'
// WebSocketProviderContext.tsx
import {
  createWsProvider,
  WebSocketDataProvider,
} from '@/lib/websocket-provider/websocket-data-provider'
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  ReactNode,
  useState,
} from 'react'
import { Attempt } from './types'

interface WebSocketProviderContextValue {
  provider: WebSocketDataProvider
  connectionAttempt: Attempt
  isConnected: boolean
}

const WebSocketProviderContext =
  createContext<WebSocketProviderContextValue | null>(null)

interface WebSocketProviderProps {
  url: string
  children: ReactNode
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({
  url,
  children,
}) => {
  const providerRef = useRef<WebSocketDataProvider | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [lastAttempt, setLastAttempt] = useState<Date | null>(null)
  const [nextAttempt, setNextAttempt] = useState<number | null>(null)
  const [attempt, setAttempt] = useState<number>(0)

  // Initialize provider only once
  if (!providerRef.current) {
    providerRef.current = createWsProvider(url)
  }

  useEffect(() => {
    // Set up connection state change handler inside useEffect
    if (providerRef.current) {
      providerRef.current.onConnectionStateChange = (connected: boolean) => {
        console.log('Connection state updated:', connected)
        setIsConnected(connected)
      }
      providerRef.current.onReconnectionProgress = (
        attempt: number,
        lastAttempt: Date | null,
        nextAttemptIn: number,
      ) => {
        console.log(
          'Reconnection progress:',
          attempt,
          lastAttempt,
          nextAttemptIn,
        )
        setAttempt(attempt)
        setLastAttempt(lastAttempt)
        setNextAttempt(nextAttemptIn)
      }
    }
    // Cleanup on unmount
    return () => {
      providerRef.current?.destroy()
    }
  }, [])

  const value = useMemo(
    () => ({
      provider: providerRef.current!,
      connectionAttempt: {
        attempt,
        lastAttempt,
        nextAttempt,
      },
      isConnected,
    }),
    [isConnected, attempt, lastAttempt, nextAttempt],
  )

  return (
    <WebSocketProviderContext.Provider value={value}>
      {children}
    </WebSocketProviderContext.Provider>
  )
}

export const useWebSocketProvider = (): WebSocketProviderContextValue => {
  const context = useContext(WebSocketProviderContext)
  if (!context) {
    throw new Error(
      'useWebSocketProvider must be used within a WebSocketProvider',
    )
  }
  return context
}
