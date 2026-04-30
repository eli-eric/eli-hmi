'use client'

import clsx from 'clsx'
import React, { useEffect, useMemo } from 'react'

import { ErrorIcon } from '@/components/ui/icons'
import { Message } from '@/app/providers/types'

import styles from './pv-display.module.css'

export type SeverityLevel = 'info' | 'warning' | 'error' | 'none'

interface PVDisplayProps<T> {
  data?: Message<T | null> | null
  children?: React.ReactNode
  isConnected?: boolean
  formatValue?: (value: T) => string
  loadingComponent?: React.ReactNode
  disconnectedComponent?: React.ReactNode
  errorComponent?: React.ReactNode
  onError?: (error: string | null) => void
  className?: string
  showSeverity?: boolean
}

/**
 * Render a PV `Message` as text + units, or fall back to a loading / error /
 * disconnected placeholder. Provide `children` to render a custom body when
 * data is available.
 */
function PVDisplayInner<T>({
  data,
  children,
  isConnected = false,
  formatValue,
  loadingComponent,
  disconnectedComponent = <span>N/A</span>,
  errorComponent,
  onError,
  className,
  showSeverity = false,
}: PVDisplayProps<T>) {
  useEffect(() => {
    if (data && !data.ok && onError) onError(data.error)
  }, [data, onError])

  const severityLevel = useMemo((): SeverityLevel => {
    if (!data || data.severity === undefined) return 'none'
    if (data.severity >= 3) return 'error'
    if (data.severity >= 1) return 'warning'
    return 'info'
  }, [data])

  const containerClasses = useMemo(() => {
    return clsx(
      styles.withError,
      showSeverity &&
        styles[
          `severity${
            severityLevel.charAt(0).toUpperCase() + severityLevel.slice(1)
          }`
        ],
      className,
    )
  }, [showSeverity, severityLevel, className])

  if (isConnected === false) {
    return <div className={containerClasses}>{disconnectedComponent}</div>
  }

  if (data === undefined) {
    if (loadingComponent) {
      return <div className={containerClasses}>{loadingComponent}</div>
    }
    return (
      <div className={clsx(containerClasses, styles.loadingDots)}>
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </div>
    )
  }

  if (data && data.ok === false) {
    if (errorComponent) {
      return <div className={containerClasses}>{errorComponent}</div>
    }
    return (
      <div className={containerClasses}>
        <span>N/A</span>
        <ErrorIcon message={data.error} className={styles.errorIcon} />
      </div>
    )
  }

  if (!children && data) {
    return (
      <div className={containerClasses}>
        <span>{`${
          data.value !== null && data.value !== undefined
            ? formatValue?.(data.value) || data.value
            : 'N/A'
        }`}</span>
        {data.units && <span>{` ${data.units}`}</span>}
      </div>
    )
  }

  return <div className={containerClasses}>{children}</div>
}

export const PVDisplay = React.memo(PVDisplayInner) as typeof PVDisplayInner
