import React, { useEffect, useState } from 'react'
import { useWebSocketProvider } from '@/app/providers/socket-provider'
import { Message } from '@/lib/websocket-provider/message'

interface WithWebSocketDataProps<T> {
  pvname: string
  onDataUpdate?: (data: Message<T>) => void
}

export function withWebSocketData<T>(
  WrappedComponent: React.ComponentType<{ data: Message<T> | null }>,
): React.FC<WithWebSocketDataProps<T>> {
  const HOC: React.FC<WithWebSocketDataProps<T>> = ({
    pvname,
    onDataUpdate,
    ...props
  }: WithWebSocketDataProps<T>) => {
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
      console.log(`Subscribing to ${pvname}`)
      provider.subscribe<T>(pvname, callback)

      return () => {
        provider.unsubscribe(pvname)
        console.log(`Unsubscribed from ${pvname}`)
      }
    }, [])

    return <WrappedComponent {...props} data={data} />
  }

  // Nastavení displayName
  HOC.displayName = `withWebSocketData(${
    WrappedComponent.displayName || WrappedComponent.name || 'Component'
  })`

  return HOC
}
