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

interface WebSocketProviderContextValue {
  provider: WebSocketDataProvider
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

  if (!providerRef.current) {
    providerRef.current = createWsProvider(url)
    providerRef.current.onConnectionStateChange = (connected: boolean) => {
      console.log('Connection state updated:', connected)
      setIsConnected(connected)
    }
  }

  useEffect(() => {
    return () => {
      providerRef.current?.destroy()
    }
  }, [])

  const value = useMemo(
    () => ({
      provider: providerRef.current!,
      isConnected,
    }),
    [isConnected],
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
