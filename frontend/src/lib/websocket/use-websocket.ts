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
import { useRuntimeConfig } from '@/lib/runtime-config/context'

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
// Mirrors AppSettings.max_pvs_per_subscription in the backend gateway.
const MAX_PVS_PER_SUBSCRIPTION = 64

interface WireError {
  code?: string | null
  message?: string | null
}

interface WireMetadata {
  severity?: number
  units?: string | null
  timestamp?: number
}

interface WireMessage {
  type?: string
  name?: string
  pv?: string
  value?: unknown
  severity?: number
  units?: string | null
  timestamp?: number
  metadata?: WireMetadata
  ok?: boolean
  error?: string | WireError | null
}

function errorMessageOf(error: WireMessage['error']): string | null {
  if (error === null || error === undefined) return null
  if (typeof error === 'string') return error
  return error.message ?? null
}

/**
 * The gateway speaks two shapes over the same socket: the batched protocol
 * (`snapshot`/`event`, PV name in `pv`, metadata nested) and the legacy
 * per-PV shape (`pv` type, flat fields, PV name in `name`). Normalize both
 * into the `Message` shape every consumer already expects. Other message
 * types (`subscribed`, `unsubscribed`, `connected`, `pong`, `error`) carry no
 * per-PV payload and are not dispatched to subscribers.
 */
function normalizeIncomingMessage(raw: unknown): Message | null {
  if (raw === null || typeof raw !== 'object') return null
  const msg = raw as WireMessage

  if (msg.type === 'snapshot' || msg.type === 'event') {
    if (!msg.pv) return null
    const meta = msg.metadata ?? {}
    return {
      type: msg.type,
      name: msg.pv,
      value: (msg.value ?? null) as Message['value'],
      severity: meta.severity ?? 0,
      units: meta.units ?? null,
      timestamp: meta.timestamp ?? Date.now() / 1000,
      ok: msg.ok ?? false,
      error: errorMessageOf(msg.error),
    }
  }

  if (msg.type === 'pv') {
    if (!msg.name) return null
    return {
      type: msg.type,
      name: msg.name,
      value: (msg.value ?? null) as Message['value'],
      severity: msg.severity ?? 0,
      units: msg.units ?? null,
      timestamp: msg.timestamp ?? Date.now() / 1000,
      ok: msg.ok ?? false,
      error: errorMessageOf(msg.error),
    }
  }

  return null
}

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
  // Wire-level batching: many PVs share one `subscription_id` so a burst of
  // `subscribe()` calls (e.g. a dashboard mounting many PV widgets at once)
  // becomes one `subscribe` message instead of one per PV — the gateway
  // otherwise processes messages on a connection strictly sequentially, so a
  // single slow/nonexistent PV would stall every other pending subscribe.
  const channelGroupRef = useRef<Map<string, string>>(new Map())
  const groupsRef = useRef<Map<string, Set<string>>>(new Map())
  const pendingAddsRef = useRef<Set<string>>(new Set())
  const pendingRemovesRef = useRef<Set<string>>(new Set())
  const flushScheduledRef = useRef(false)
  const subscriptionIdSeqRef = useRef(0)
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
  const { status: runtimeConfigStatus, wsUrl } = useRuntimeConfig()

  const url = useMemo(() => {
    if (!accessToken || runtimeConfigStatus !== 'ready') return null
    return `${wsUrl}?auth=${accessToken}`
  }, [accessToken, runtimeConfigStatus, wsUrl])

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

  const nextSubscriptionId = useCallback(() => {
    subscriptionIdSeqRef.current += 1
    return `fe-${subscriptionIdSeqRef.current}`
  }, [])

  const flushPending = useCallback(() => {
    flushScheduledRef.current = false

    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      // Not connected — `subscriptionsRef` already reflects desired state;
      // `replaySubscriptions` rebuilds every group from scratch on the next
      // 'open', so there's nothing meaningful to flush right now.
      pendingAddsRef.current.clear()
      pendingRemovesRef.current.clear()
      return
    }

    const removes = pendingRemovesRef.current
    const adds = pendingAddsRef.current
    pendingRemovesRef.current = new Set()
    pendingAddsRef.current = new Set()

    // The wire protocol only supports unsubscribing a whole subscription_id,
    // not one PV out of a batch. So a partial removal means: unsubscribe the
    // old group, then re-subscribe whichever siblings are still wanted as a
    // fresh group (they'll get a superfluous re-snapshot, which is cheap and
    // rare compared to serializing every subscribe on the wire).
    const affectedGroups = new Map<string, Set<string>>()
    removes.forEach((channel) => {
      const groupId = channelGroupRef.current.get(channel)
      if (!groupId) return
      channelGroupRef.current.delete(channel)
      if (!affectedGroups.has(groupId)) affectedGroups.set(groupId, new Set())
      affectedGroups.get(groupId)?.add(channel)
    })

    affectedGroups.forEach((removedChannels, groupId) => {
      const group = groupsRef.current.get(groupId)
      groupsRef.current.delete(groupId)
      debug('ws:unsubscribe', 'batch', groupId)
      send({ type: 'unsubscribe', subscription_id: groupId })
      group?.forEach((channel) => {
        if (!removedChannels.has(channel)) adds.add(channel)
      })
    })

    const channels = [...adds]
    for (let i = 0; i < channels.length; i += MAX_PVS_PER_SUBSCRIPTION) {
      const chunk = channels.slice(i, i + MAX_PVS_PER_SUBSCRIPTION)
      const subscriptionId = nextSubscriptionId()
      groupsRef.current.set(subscriptionId, new Set(chunk))
      chunk.forEach((channel) =>
        channelGroupRef.current.set(channel, subscriptionId),
      )
      debug('ws:subscribe', 'batch', subscriptionId, chunk)
      // `detail: 'time'` gets severity/status/timestamp in `metadata` —
      // omitting it would default to the gateway's 'value' level, which
      // drops those fields and silently starves every consumer that reads
      // them. 'control' would add display/control limits too, which nothing
      // here consumes.
      send({
        type: 'subscribe',
        subscription_id: subscriptionId,
        pvs: chunk,
        detail: 'time',
      })
    }
  }, [send, nextSubscriptionId])

  const scheduleFlush = useCallback(() => {
    if (flushScheduledRef.current) return
    flushScheduledRef.current = true
    queueMicrotask(flushPending)
  }, [flushPending])

  const queueAdd = useCallback(
    (channel: string) => {
      pendingRemovesRef.current.delete(channel)
      pendingAddsRef.current.add(channel)
      scheduleFlush()
    },
    [scheduleFlush],
  )

  const queueRemove = useCallback(
    (channel: string) => {
      if (pendingAddsRef.current.has(channel)) {
        // Never made it to the wire — nothing to undo.
        pendingAddsRef.current.delete(channel)
        return
      }
      pendingRemovesRef.current.add(channel)
      scheduleFlush()
    },
    [scheduleFlush],
  )

  const replaySubscriptions = useCallback(() => {
    groupsRef.current.clear()
    channelGroupRef.current.clear()
    pendingRemovesRef.current.clear()
    subscriptionsRef.current.forEach((_, channel) => {
      pendingAddsRef.current.add(channel)
    })
    debug('ws:subscribe', 'replay', pendingAddsRef.current.size, 'channel(s)')
    flushPending()
  }, [flushPending])

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
      // Groups live on the now-dead connection; the next 'open' rebuilds
      // them all from scratch via replaySubscriptions.
      groupsRef.current.clear()
      channelGroupRef.current.clear()
      pendingAddsRef.current.clear()
      pendingRemovesRef.current.clear()
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
        const message = normalizeIncomingMessage(JSON.parse(event.data))
        if (!message) return
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

      // First subscriber: queue it for the next microtask flush, which
      // batches it with any other channels subscribed in the same tick. If
      // the socket isn't open yet, replaySubscriptions on the next 'open'
      // picks it up from subscriptionsRef directly.
      if (isFirst) {
        debug('ws:subscribe', 'queue', channel)
        queueAdd(channel)
      }

      return () => {
        const set = subscriptionsRef.current.get(channel)
        if (!set) return
        set.delete(callback as SubscriptionCallback)
        if (set.size === 0) {
          subscriptionsRef.current.delete(channel)
          debug('ws:unsubscribe', 'queue', channel)
          queueRemove(channel)
        }
      }
    },
    [queueAdd, queueRemove],
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
    const groups = groupsRef
    const channelGroups = channelGroupRef
    const pendingAdds = pendingAddsRef
    const pendingRemoves = pendingRemovesRef
    return () => {
      clearReconnectTimer()
      clearCountdown()
      closeSocket()
      subs.current.clear()
      groups.current.clear()
      channelGroups.current.clear()
      pendingAdds.current.clear()
      pendingRemoves.current.clear()
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
