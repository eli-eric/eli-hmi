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
  /**
   * Push a Message to all subscribers of `pv`. Two call shapes:
   *   push(pv, value)                          — convenience: minimal msg
   *   push(pv, { value, units, ok, ... })      — full Partial<Message<T>>
   * The full form lets callers stamp non-default fields (e.g. `ok: false`,
   * `units`, `severity`). The convenience form is identical to
   *   push(pv, { value })
   */
  push: {
    <T>(pv: string, value: T | null): void
    <T>(pv: string, msg: Partial<Message<T>> & { value: T | null }): void
  }
  /** All wire messages the consumer sent via `context.send`. */
  getSent: () => unknown[]
  /**
   * Live map of PV → subscriber set. Tests can `waitFor(() =>
   * controller.subscriptions.get(pv)?.size === 1)` before pushing values to
   * avoid first-paint race conditions.
   */
  subscriptions: ReadonlyMap<string, ReadonlySet<SubscriptionCallback>>
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

  function push<T>(pv: string, arg: T | (Partial<Message<T>> & { value: T | null })): void {
    const callbacks = subs.get(pv)
    if (!callbacks) return
    const partial =
      arg !== null && typeof arg === 'object' && 'value' in (arg as object)
        ? (arg as Partial<Message<T>> & { value: T | null })
        : ({ value: arg as T | null } as Partial<Message<T>> & {
            value: T | null
          })
    const full: Message<T> = {
      type: 'pv',
      name: pv,
      severity: 0,
      units: null,
      timestamp: Date.now(),
      ok: true,
      error: null,
      ...partial,
    }
    callbacks.forEach((cb) => cb(full as Message))
  }

  return {
    context,
    push: push as FakeWebSocketController['push'],
    getSent: () => sent.slice(),
    subscriptions: subs,
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
