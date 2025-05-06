import React, { useEffect, useState } from 'react'
import { useWebSocketProvider } from '@/app/providers/socket-provider'
import { Message } from '@/lib/websocket-provider/message'

interface WithWebSocketDataProps<T> {
  pvname: string
  onDataUpdate?: (data: Message<T>) => void
}

export function withWebSocketData<T, P>(
  WrappedComponent: React.ComponentType<P & { data: Message<T> | null }>, // Allow additional props
): React.FC<WithWebSocketDataProps<T> & P> {
  const HOC: React.FC<WithWebSocketDataProps<T> & P> = ({
    pvname,
    onDataUpdate,
    ...props // Collect additional props
  }: WithWebSocketDataProps<T> & P) => {
    const { provider } = useWebSocketProvider()
    const [data, setData] = useState<Message<T> | null>(null)

    useEffect(() => {
      if (!pvname) return
      const callback = (msg: Message<T>) => {
        setData(msg)
        if (onDataUpdate) {
          onDataUpdate(msg)
        }
      }
      provider.subscribe<T>(pvname, callback)

      return () => {
        provider.unsubscribe(pvname)
      }
    }, [pvname, provider, onDataUpdate])

    return <WrappedComponent {...(props as P)} data={data} /> // Pass all props, including `data`
  }

  HOC.displayName = `withWebSocketData(${
    WrappedComponent.displayName || WrappedComponent.name || 'Component'
  })`

  return HOC
}
