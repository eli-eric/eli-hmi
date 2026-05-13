'use client'

import { ReactNode } from 'react'
import { WebSocketContext } from '@/app/providers/socket-provider'
import { Message, WebSocketContextValue } from '@/app/providers/types'

type AnyCallback = (msg: Message<unknown>) => void

export interface MockWebSocket {
  value: WebSocketContextValue
  push: <T>(pv: string, value: T, partial?: Partial<Message<T>>) => void
  subscriptions: Map<string, Set<AnyCallback>>
}

export function createMockWebSocket(
  init: { isConnected?: boolean } = {},
): MockWebSocket {
  const subscriptions = new Map<string, Set<AnyCallback>>()
  const isConnected = init.isConnected ?? true

  const value: WebSocketContextValue = {
    subscribe: <T,>(channel: string, cb: (msg: Message<T>) => void) => {
      if (!subscriptions.has(channel)) subscriptions.set(channel, new Set())
      subscriptions.get(channel)!.add(cb as AnyCallback)
      return () => {
        subscriptions.get(channel)?.delete(cb as AnyCallback)
      }
    },
    send: () => true,
    reconnect: () => {},
    isConnected,
    connectionState: {
      status: isConnected ? 'connected' : 'disconnected',
      reconnectAttempts: 0,
      lastAttempt: null,
      nextAttemptInSeconds: null,
      countdown: null,
    },
  }

  function push<T>(pv: string, value: T, partial?: Partial<Message<T>>) {
    const msg: Message<T> = {
      type: 'pv',
      name: pv,
      value,
      severity: 0,
      units: null,
      timestamp: Date.now() / 1000,
      ok: true,
      error: null,
      ...partial,
    }
    subscriptions.get(pv)?.forEach((cb) => cb(msg as Message<unknown>))
  }

  return { value, push, subscriptions }
}

export function MockWebSocketProvider({
  ws,
  children,
}: {
  ws: MockWebSocket
  children: ReactNode
}) {
  return (
    <WebSocketContext.Provider value={ws.value}>
      {children}
    </WebSocketContext.Provider>
  )
}
