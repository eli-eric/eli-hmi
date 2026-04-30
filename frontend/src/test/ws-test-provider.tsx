'use client'

import { ReactNode } from 'react'

import { WebSocketContext } from '@/app/providers/socket-provider'
import { Message, WebSocketContextValue } from '@/app/providers/types'

type SubscriptionCallback<T = unknown> = (msg: Message<T>) => void

export interface FakeWebSocketContextOptions {
  isConnected?: boolean
  subscribe?: <T>(channel: string, cb: SubscriptionCallback<T>) => () => void
  send?: (msg: unknown) => boolean
  reconnect?: () => void
}

export interface FakeWebSocketController {
  context: WebSocketContextValue
  /** Push a Message<T> to all subscribers of `pv`. */
  push: <T>(pv: string, msg: Partial<Message<T>> & { value: T | null }) => void
  /** All wire messages the consumer sent via `context.send`. */
  getSent: () => unknown[]
}

export function makeFakeWebSocketContext(
  opts: FakeWebSocketContextOptions = {},
): FakeWebSocketController {
  const subs = new Map<string, Set<SubscriptionCallback>>()
  const sent: unknown[] = []

  const context: WebSocketContextValue = {
    isConnected: opts.isConnected ?? true,
    connectionState: {
      status: opts.isConnected === false ? 'disconnected' : 'connected',
      reconnectAttempts: 0,
      lastAttempt: null,
      nextAttemptInSeconds: null,
      countdown: null,
    },
    send:
      opts.send ??
      ((msg) => {
        sent.push(msg)
        return true
      }),
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

  return {
    context,
    push: <T,>(pv: string, msg: Partial<Message<T>> & { value: T | null }) => {
      const callbacks = subs.get(pv)
      if (!callbacks) return
      const full: Message<T> = {
        type: 'pv',
        name: pv,
        severity: 0,
        units: null,
        timestamp: Date.now(),
        ok: true,
        error: null,
        ...msg,
      }
      callbacks.forEach((cb) => cb(full as Message))
    },
    getSent: () => sent.slice(),
  }
}

export function TestWebSocketProvider({
  value,
  children,
}: {
  value: WebSocketContextValue
  children: ReactNode
}) {
  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  )
}
