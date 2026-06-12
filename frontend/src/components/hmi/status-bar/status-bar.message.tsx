'use client'

import style from './status-bar-message.module.css'
import { useMemo, useSyncExternalStore } from 'react'
import { formatDateTime } from '@/lib/utils/formatters'
import { useWebSocketContext } from '@/app/providers/socket-provider'

// Client-detection without a set-state-in-effect: useSyncExternalStore returns
// the server snapshot (false) during SSR + hydration and the client snapshot
// (true) afterwards, so time-dependent content renders only after hydration.
const subscribeNoop = () => () => {}
const getIsClient = () => true
const getIsClientServer = () => false

export const StatusBarMessage = () => {
  // Get direct access to the WebSocket context to have the real-time countdown
  const { connectionState } = useWebSocketContext()
  const isClient = useSyncExternalStore(
    subscribeNoop,
    getIsClient,
    getIsClientServer,
  )

  const { lastAttempt } = connectionState

  // Format the timestamp for the last connection attempt
  const formattedLastAttempt = useMemo(() => {
    if (!lastAttempt) {
      return 'N/A'
    }
    return formatDateTime(lastAttempt)
  }, [lastAttempt])

  // Get values from connection state
  const countdown = connectionState?.countdown || 'N/A'
  const attemptCount = connectionState?.reconnectAttempts || 0

  console.log(
    `[StatusBarMessage] Attempt #${attemptCount}, Countdown: ${countdown}, Last Attempt: ${formattedLastAttempt}`,
  )

  // Server-side or initial render
  if (!isClient) {
    return (
      <div className={style.container}>
        <span className={style.head}>WebSocket Disconnected</span>
        <span className={style.text}>Attempting to reconnect...</span>
      </div>
    )
  }

  return (
    <div className={style.container}>
      <span
        className={style.head}
      >{`WebSocket Disconnected (Attempt #${attemptCount})`}</span>
      <span
        className={style.text}
      >{`Last Check At ${formattedLastAttempt}`}</span>
      <span className={style.text}>
        {`Next Automatic Check in ${countdown} s...`}
      </span>
    </div>
  )
}
