'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Message } from './message'

// Types
type SubscriptionCallback<T = unknown> = (data: Message<T>) => void
type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

interface WebSocketState {
  status: ConnectionStatus
  reconnectAttempts: number
  lastAttempt: Date | null
  nextAttemptInSeconds: number | null
  countdown: number | null // Current countdown in seconds until next reconnection attempt
}

/**
 * React hook for WebSocket connection management
 */
export function useWebSocket(url: string) {
  // WebSocket instance ref
  const wsRef = useRef<WebSocket | null>(null)
  // Manage subscriptions
  const subscriptionsRef = useRef<Map<string, Set<SubscriptionCallback>>>(
    new Map(),
  )
  // Event listeners refs
  const eventListenersRef = useRef<Map<string, Set<EventListener>>>(new Map())
  // Reconnection state
  const [state, setState] = useState<WebSocketState>({
    status: 'connecting',
    reconnectAttempts: 0,
    lastAttempt: null,
    nextAttemptInSeconds: null,
    countdown: null,
  })

  // Store reconnect attempts in a ref to persist between renders and reconnections
  const reconnectAttemptsRef = useRef<number>(0)

  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectIntervalRef = useRef<number>(5000) // Initial reconnect interval

  // Initialize or reconnect
  const connect = useCallback(
    (resubscribe = false) => {
      // Clean up any existing connection
      if (wsRef.current) {
        try {
          // Remove all event listeners
          wsRef.current.onopen = null
          wsRef.current.onclose = null
          wsRef.current.onerror = null
          wsRef.current.onmessage = null

          // Close connection if open
          if (
            wsRef.current.readyState === WebSocket.OPEN ||
            wsRef.current.readyState === WebSocket.CONNECTING
          ) {
            wsRef.current.close(1000, 'Clean close')
          }
        } catch (e) {
          console.error('Error closing WebSocket:', e)
        }
        wsRef.current = null
      }

      // Clear any reconnect timer
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }

      // Create new WebSocket
      try {
        console.log(`Connecting to ${url}...`)
        setState((prev) => ({ ...prev, status: 'connecting' }))
        wsRef.current = new WebSocket(url)

        // Setup event handlers
        wsRef.current.onopen = () => {
          console.log('WebSocket connected successfully')
          // Reset reconnection attempts only on successful connection
          reconnectAttemptsRef.current = 0
          setState((prev) => ({
            ...prev,
            status: 'connected',
            reconnectAttempts: 0,
            lastAttempt: null,
            nextAttemptInSeconds: null,
            countdown: null,
          }))

          // Resubscribe to all channels if reconnecting
          if (resubscribe) {
            subscriptionsRef.current.forEach((_, channel) => {
              sendSubscription(channel)
            })
          }
        }

        wsRef.current.onclose = (event) => {
          console.log(`WebSocket closed: ${event.code} ${event.reason}`)
          setState((prev) => ({ ...prev, status: 'disconnected' }))
          scheduleReconnect()
        }

        wsRef.current.onerror = (event) => {
          console.error('WebSocket error:', event)
          setState((prev) => ({ ...prev, status: 'disconnected' }))
          scheduleReconnect()
        }

        wsRef.current.onmessage = (event) => {
          try {
            const message: Message = JSON.parse(event.data)
            const callbacks = subscriptionsRef.current.get(message.name)
            if (callbacks) {
              callbacks.forEach((callback) => callback(message))
            }
          } catch (e) {
            console.error('Error processing message:', e)
          }
        }
      } catch (e) {
        console.error('Error creating WebSocket:', e)
        setState((prev) => ({ ...prev, status: 'disconnected' }))
        scheduleReconnect()
      }
    },
    [url],
  )

  // Schedule a reconnection attempt
  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current) return // Already scheduled

    const now = new Date()
    // Increment the attempts counter in the ref to persist between reconnections
    reconnectAttemptsRef.current++
    const reconnectAttempts = reconnectAttemptsRef.current

    // Use exponential backoff with jitter for reconnection
    const baseDelay = reconnectIntervalRef.current
    const maxDelay = 30000 // Cap at 30 seconds

    // Calculate exponential delay with jitter
    const exponentialDelay = Math.min(
      baseDelay * Math.pow(1.5, Math.min(reconnectAttempts, 5)),
      maxDelay,
    )
    const jitter = Math.random() * 1000 // Add up to 1 second of jitter
    const delay = Math.floor(exponentialDelay + jitter)

    console.log(
      `Scheduling reconnection attempt ${reconnectAttempts} in ${delay}ms (${Math.round(
        delay / 1000,
      )}s)`,
    )

    // Log attempt details for debugging
    console.log(`WebSocket reconnection details:
      - Total attempts: ${reconnectAttempts}
      - Last attempt: ${now.toISOString()}
      - Delay: ${delay}ms
      - Exponential base: ${reconnectIntervalRef.current}
      - Max delay: ${maxDelay}
    `)

    const nextAttemptInSeconds = Math.round(delay / 1000)

    setState((prev) => ({
      ...prev,
      reconnectAttempts,
      lastAttempt: now,
      nextAttemptInSeconds,
      countdown: nextAttemptInSeconds,
    }))

    // Start countdown timer
    const countdownInterval = setInterval(() => {
      setState((prev) => {
        if (prev.countdown === null || prev.countdown <= 1) {
          clearInterval(countdownInterval)
          return prev
        }
        return {
          ...prev,
          countdown: prev.countdown - 1,
        }
      })
    }, 1000)

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null
      clearInterval(countdownInterval) // Clear the countdown interval
      connect(true) // Resubscribe on reconnect
    }, delay)
  }, [connect])

  // Send message if connected
  const send = useCallback((message: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(message))
        return true
      } catch (e) {
        console.error('Error sending message:', e)
        return false
      }
    } else {
      console.warn('WebSocket not open, cannot send message')
      return false
    }
  }, [])

  // Helper to send subscription message
  const sendSubscription = useCallback(
    (channel: string) => {
      const pvs = new Map<string, boolean>()
      pvs.set(channel, true)
      console.log(`MAP to ${pvs}`)
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        console.log(`Subscribing to ${channel}`)
        send({ type: 'subscribe', pvs: { [channel]: true } })
      } else {
        console.log(
          `Not connected, will subscribe to ${channel} when connection is established`,
        )

        // Add one-time event listener for connection
        const onOpen = () => {
          send({ type: 'subscribe', pvs: { [channel]: true } })
        }

        if (wsRef.current) {
          wsRef.current.addEventListener('open', onOpen, { once: true })

          // Store event listener for cleanup
          if (!eventListenersRef.current.has('open')) {
            eventListenersRef.current.set('open', new Set())
          }
          eventListenersRef.current.get('open')?.add(onOpen)
        }
      }
    },
    [send],
  )

  // Helper to send unsubscription message
  const sendUnsubscription = useCallback(
    (channel: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        console.log(`Unsubscribing from ${channel}`)
        send({ type: 'unsubscribe', pvs: { [channel]: true } })
      }
    },
    [send],
  )

  // Subscribe to a channel
  const subscribe = useCallback(
    <T,>(channel: string, callback: SubscriptionCallback<T>) => {
      // Create subscription set if it doesn't exist
      if (!subscriptionsRef.current.has(channel)) {
        subscriptionsRef.current.set(channel, new Set())
        // Only send subscription if connected
        sendSubscription(channel)
      }

      // Add callback to subscription set
      subscriptionsRef.current
        .get(channel)
        ?.add(callback as SubscriptionCallback)

      // Return unsubscribe function
      return () => {
        const callbacks = subscriptionsRef.current.get(channel)
        if (callbacks) {
          callbacks.delete(callback as SubscriptionCallback)

          // If no more callbacks, unsubscribe from channel
          if (callbacks.size === 0) {
            subscriptionsRef.current.delete(channel)
            sendUnsubscription(channel)
          }
        }
      }
    },
    [sendSubscription, sendUnsubscription],
  )

  // Force reconnection
  const reconnect = useCallback(() => {
    console.log('Manual reconnection requested')
    connect(true)
  }, [connect])

  // Initialize connection on mount
  useEffect(() => {
    connect(false)
    // Cleanup function
    return () => {
      // Clear any reconnect timer
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
      // Close WebSocket connectin
      if (wsRef.current) {
        try {
          wsRef.current.onopen = null
          wsRef.current.onclose = null
          wsRef.current.onerror = null
          wsRef.current.onmessage = null

          if (
            wsRef.current.readyState === WebSocket.OPEN ||
            wsRef.current.readyState === WebSocket.CONNECTING
          ) {
            wsRef.current.close(1000, 'Component unmounted')
          }
        } catch (e) {
          console.error('Error closing WebSocket:', e)
        }
      }

      // Clear subscriptions and event listeners
      subscriptionsRef.current.clear()
      eventListenersRef.current.clear()
    }
  }, [connect, url])

  return {
    subscribe,
    send,
    reconnect,
    isConnected: state.status === 'connected',
    status: state.status,
    connectionState: state,
  }
}
