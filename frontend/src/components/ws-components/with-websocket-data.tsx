'use client'

import React, { useEffect, useState, useRef } from 'react'
import { Message } from '@/lib/websocket-provider/message'
import { useWebSocketContext } from '@/app/providers/socket-provider'

interface WithWebSocketDataProps<T> {
  pvname: string
  onDataUpdate?: (data: Message<T>) => void
}

/**
 * Higher-Order Component that subscribes to WebSocket data
 */
export function withReactWebSocketData<T, P>(
  WrappedComponent: React.ComponentType<P & { data: Message<T> | null }>,
): React.FC<WithWebSocketDataProps<T> & P> {
  const HOC: React.FC<WithWebSocketDataProps<T> & P> = ({
    pvname,
    onDataUpdate,
    ...props
  }) => {
    const { subscribe, isConnected } = useWebSocketContext()
    const [data, setData] = useState<Message<T> | null>(null)
    const [mounted, setMounted] = useState(false)

    // Create stable callback for subscription
    const callbackRef = useRef((msg: Message<T>) => {
      setData(msg)
      if (onDataUpdate) {
        onDataUpdate(msg)
      }
    })

    // Set mounted flag to handle hydration issue
    useEffect(() => {
      setMounted(true)
    }, [])

    // Handle subscription to PV
    useEffect(() => {
      if (!pvname || !mounted) return

      console.log(`[withReactWebSocketData] Subscribing to: ${pvname}`)

      // Subscribe and get unsubscribe function
      const unsubscribe = subscribe<T>(pvname, callbackRef.current)

      // Clean up subscription on unmount
      return () => {
        console.log(`[withReactWebSocketData] Unsubscribing from: ${pvname}`)
        unsubscribe()
      }
    }, [pvname, subscribe, mounted])

    if (!mounted) {
      // Return a simple placeholder during SSR to avoid hydration issues
      return <WrappedComponent {...(props as P)} data={null} isConnected={false} />
    }
    return <WrappedComponent {...(props as P)} data={data} isConnected={isConnected} />
  }

  HOC.displayName = `withReactWebSocketData(${
    WrappedComponent.displayName || WrappedComponent.name || 'Component'
  })`

  return HOC
}
