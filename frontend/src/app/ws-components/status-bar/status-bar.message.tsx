'use client'

import { Attempt } from '@/app/providers/types'
import style from './status-bar-message.module.css'
import { useEffect, useState, useMemo } from 'react'
import { formatDateTime } from '@/lib/utils/formatters'

export const StatusBarMessage = ({ attempt }: { attempt: Attempt }) => {
  const [timer, setTimer] = useState(attempt.nextAttempt ?? 8)
  const [lastAttempt, setLastAttempt] = useState(attempt.lastAttempt)

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          setLastAttempt(attempt.lastAttempt)
          return attempt.nextAttempt ?? 8
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [attempt])

  useEffect(() => {
    setTimer(attempt.nextAttempt ?? 8)
  }, [attempt.nextAttempt])

  const formattedLastAttempt = useMemo(
    () => formatDateTime(lastAttempt ?? new Date()),
    [lastAttempt],
  )

  return (
    <div className={style.container}>
      <span className={style.head}>WebSocket Disconnected</span>
      <span
        className={style.text}
      >{`Last Check At ${formattedLastAttempt}`}</span>
      <span
        className={style.text}
      >{`Next Automatic Check in ${timer} s...`}</span>
    </div>
  )
}
