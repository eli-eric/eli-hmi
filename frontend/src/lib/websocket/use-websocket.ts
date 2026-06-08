'use client'

import { useSession } from 'next-auth/react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { Message } from '@/app/providers/types'
import { WS_URL } from '@/types/constants'

import { debug } from './debug'

type SubscriptionCallback<T = unknown> = (data: Message<T>) => void
type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

interface WebSocketState {
  status: ConnectionStatus
  reconnectAttempts: number
  lastAttempt: Date | null
  nextAttemptInSeconds: number | null
  countdown: number | null
}

const INITIAL_RECONNECT_INTERVAL_MS = 5000
const MAX_RECONNECT_DELAY_MS = 30000
const COUNTDOWN_TICK_MS = 1000

/**
 * React hook for WebSocket connection management.
 *
 * One connection per hook instance (typically one per app via the provider).
 * Caller stores subscriptions in a ref-backed map; on reconnect, every channel
 * is re-subscribed via {@link replaySubscriptions}.
 */
export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const subscriptionsRef = useRef<Map<string, Set<SubscriptionCallback>>>(
    new Map(),
  )
  const reconnectAttemptsRef = useRef<number>(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  )
  const reconnectBaseDelayRef = useRef<number>(INITIAL_RECONNECT_INTERVAL_MS)
  // `connect` and `scheduleReconnect` reference each other. We could put one
  // in the other's dep list and disable exhaustive-deps for the cycle, but
  // that gives the closures stale identities across token-refresh re-renders.
  // Instead, route both calls through refs so each useCallback has a clean
  // dep list and always sees the freshest sibling.
  const connectRef = useRef<() => void>(() => {})
  const scheduleReconnectRef = useRef<() => void>(() => {})

  // Start in `disconnected`. `connect()` flips us to `connecting` once an
  // accessToken is available — without this, a session that never authenticates
  // would leave the UI stuck on a "connecting…" spinner forever.
  const [state, setState] = useState<WebSocketState>({
    status: 'disconnected',
    reconnectAttempts: 0,
    lastAttempt: null,
    nextAttemptInSeconds: null,
    countdown: null,
  })

  const { data: session } = useSession()
  const accessToken = session?.accessToken

  const url = useMemo(() => {
    if (!accessToken) return null
    return `${WS_URL}?auth=${accessToken}`
  }, [accessToken])

  const send = useCallback((message: unknown) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      debug('ws:send', 'socket not open, dropping message')
      return false
    }
    try {
      wsRef.current.send(JSON.stringify(message))
      return true
    } catch (e) {
      console.error('[ws:send] error sending message', e)
      return false
    }
  }, [])

  const replaySubscriptions = useCallback(() => {
    subscriptionsRef.current.forEach((_, channel) => {
      debug('ws:subscribe', 'replay', channel)
      send({ type: 'subscribe', pvs: { [channel]: true } })
    })
  }, [send])

  const clearCountdown = useCallback(() => {
    if (countdownIntervalRef.current !== null) {
      clearInterval(countdownIntervalRef.current)
      countdownIntervalRef.current = null
    }
  }, [])

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
  }, [])

  const closeSocket = useCallback(() => {
    const ws = wsRef.current
    if (!ws) return
    try {
      ws.onopen = null
      ws.onclose = null
      ws.onerror = null
      ws.onmessage = null
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close(1000, 'Clean close')
      }
    } catch (e) {
      console.error('[ws:close] error closing socket', e)
    }
    wsRef.current = null
  }, [])

  const connect = useCallback(() => {
    if (!url) {
      debug('ws:connect', 'no access token, skipping')
      return
    }
    closeSocket()
    clearReconnectTimer()
    clearCountdown()

    debug('ws:connect', 'connecting to', url)
    setState((prev) => ({ ...prev, status: 'connecting' }))

    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch (e) {
      console.error('[ws:connect] error creating WebSocket', e)
      setState((prev) => ({ ...prev, status: 'disconnected' }))
      scheduleReconnectRef.current()
      return
    }
    wsRef.current = ws

    ws.onopen = () => {
      debug('ws:connect', 'connected')
      reconnectAttemptsRef.current = 0
      setState((prev) => ({
        ...prev,
        status: 'connected',
        reconnectAttempts: 0,
        lastAttempt: null,
        nextAttemptInSeconds: null,
        countdown: null,
      }))
      replaySubscriptions()
    }

    ws.onclose = (event) => {
      debug('ws:connect', 'closed', event.code, event.reason)
      setState((prev) => ({ ...prev, status: 'disconnected' }))
      scheduleReconnectRef.current()
    }

    ws.onerror = (event) => {
      console.error('[ws:connect] error event', event)
      setState((prev) => ({ ...prev, status: 'disconnected' }))
      scheduleReconnectRef.current()
    }

    ws.onmessage = (event) => {
      try {
        const message: Message = JSON.parse(event.data)
        const callbacks = subscriptionsRef.current.get(message.name)
        if (callbacks) callbacks.forEach((cb) => cb(message))
      } catch (e) {
        console.error('[ws:onmessage] parse error', e)
      }
    }
  }, [
    url,
    closeSocket,
    clearReconnectTimer,
    clearCountdown,
    replaySubscriptions,
  ])

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current !== null) return // already scheduled
    clearCountdown()

    const now = new Date()
    reconnectAttemptsRef.current += 1
    const attempt = reconnectAttemptsRef.current

    const exponentialDelay = Math.min(
      reconnectBaseDelayRef.current * Math.pow(1.5, Math.min(attempt, 5)),
      MAX_RECONNECT_DELAY_MS,
    )
    const jitter = Math.random() * 1000
    const delay = Math.floor(exponentialDelay + jitter)
    const nextAttemptInSeconds = Math.round(delay / 1000)

    debug('ws:reconnect', `attempt ${attempt} in ${delay}ms`)

    setState((prev) => ({
      ...prev,
      reconnectAttempts: attempt,
      lastAttempt: now,
      nextAttemptInSeconds,
      countdown: nextAttemptInSeconds,
    }))

    countdownIntervalRef.current = setInterval(() => {
      setState((prev) => {
        if (prev.countdown === null || prev.countdown <= 1) {
          clearCountdown()
          return prev
        }
        return { ...prev, countdown: prev.countdown - 1 }
      })
    }, COUNTDOWN_TICK_MS)

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null
      clearCountdown()
      connectRef.current()
    }, delay)
  }, [clearCountdown])

  // Wire the refs to the latest callbacks. `connect` and `scheduleReconnect`
  // reach for each other through these refs so neither needs the other in its
  // dep list. Use useLayoutEffect to avoid the "ref written during render"
  // anti-pattern (StrictMode double-render or concurrent rendering could
  // otherwise leave a ref pointing at a discarded callback briefly). Both
  // refs are only read from event handlers and timers, never synchronously
  // during render, so a layout-effect pass is plenty soon enough.
  useLayoutEffect(() => {
    connectRef.current = connect
    scheduleReconnectRef.current = scheduleReconnect
  })

  const subscribe = useCallback(
    <T,>(channel: string, callback: SubscriptionCallback<T>) => {
      const isFirst = !subscriptionsRef.current.has(channel)
      if (isFirst) {
        subscriptionsRef.current.set(channel, new Set())
      }
      subscriptionsRef.current
        .get(channel)
        ?.add(callback as SubscriptionCallback)

      // First subscriber: send to wire if open; otherwise replaySubscriptions
      // on the next 'open' will pick it up.
      if (isFirst && wsRef.current?.readyState === WebSocket.OPEN) {
        debug('ws:subscribe', 'send', channel)
        send({ type: 'subscribe', pvs: { [channel]: true } })
      }

      return () => {
        const set = subscriptionsRef.current.get(channel)
        if (!set) return
        set.delete(callback as SubscriptionCallback)
        if (set.size === 0) {
          subscriptionsRef.current.delete(channel)
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            debug('ws:unsubscribe', channel)
            send({ type: 'unsubscribe', pvs: { [channel]: true } })
          }
        }
      }
    },
    [send],
  )

  const reconnect = useCallback(() => {
    debug('ws:reconnect', 'manual')
    connect()
  }, [connect])

  useEffect(() => {
    if (!url) return
    // connect() imperatively opens the WebSocket and synchronously sets status
    // -> 'connecting'. This is a legitimate "synchronize with an external system
    // on mount" effect; the status set is intrinsic to opening the socket, and
    // rewriting this hook onto useSyncExternalStore is out of scope here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    connect()
    const subs = subscriptionsRef
    return () => {
      clearReconnectTimer()
      clearCountdown()
      closeSocket()
      subs.current.clear()
    }
  }, [connect, url, clearReconnectTimer, clearCountdown, closeSocket])

  return {
    subscribe,
    send,
    reconnect,
    isConnected: state.status === 'connected',
    status: state.status,
    connectionState: state,
  }
}
