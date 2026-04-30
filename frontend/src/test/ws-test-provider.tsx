'use client'

import { createContext, ReactNode, useContext } from 'react'
import { Message } from '@/app/providers/types'
import { WebSocketContextValue } from '@/app/providers/types'

type SubscriptionCallback<T = unknown> = (msg: Message<T>) => void

export interface FakeWebSocketContextOptions {
  isConnected?: boolean
  subscribe?: <T>(channel: string, cb: SubscriptionCallback<T>) => () => void
  send?: (msg: unknown) => boolean
  reconnect?: () => void
}

export function makeFakeWebSocketContext(
  opts: FakeWebSocketContextOptions = {},
): WebSocketContextValue {
  const subs = new Map<string, Set<SubscriptionCallback>>()
  return {
    isConnected: opts.isConnected ?? true,
    connectionState: {
      status: opts.isConnected === false ? 'disconnected' : 'connected',
      reconnectAttempts: 0,
      lastAttempt: null,
      nextAttemptInSeconds: null,
      countdown: null,
    },
    send: opts.send ?? (() => true),
    reconnect: opts.reconnect ?? (() => undefined),
    subscribe:
      opts.subscribe ??
      (<T,>(channel: string, cb: SubscriptionCallback<T>) => {
        if (!subs.has(channel)) subs.set(channel, new Set())
        subs.get(channel)!.add(cb as SubscriptionCallback)
        return () => {
          const set = subs.get(channel)
          if (!set) return
          set.delete(cb as SubscriptionCallback)
          if (set.size === 0) subs.delete(channel)
        }
      }),
  }
}

const TestWebSocketContext = createContext<WebSocketContextValue | undefined>(
  undefined,
)

export function TestWebSocketProvider({
  value,
  children,
}: {
  value: WebSocketContextValue
  children: ReactNode
}) {
  return (
    <TestWebSocketContext.Provider value={value}>
      {children}
    </TestWebSocketContext.Provider>
  )
}

export function useTestWebSocketContext(): WebSocketContextValue {
  const ctx = useContext(TestWebSocketContext)
  if (!ctx) throw new Error('useTestWebSocketContext must be used within TestWebSocketProvider')
  return ctx
}
