import React, { useMemo } from 'react'
import clsx from 'clsx'
import { ErrorIcon } from '../ui/icons'
import styles from './with-error-data.module.css'
import { Message } from '@/app/providers/types'

export type SeverityLevel = 'info' | 'warning' | 'error' | 'none'

interface WithErrorDataProps<T> {
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

export const WithErrorData = <T,>({
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
}: WithErrorDataProps<T>) => {
  // Call onError callback when error occurs
  React.useEffect(() => {
    if (data && !data.ok && onError) {
      onError(data.error)
    }
  }, [data, onError])

  // Get severity level based on severity number
  const severityLevel = useMemo((): SeverityLevel => {
    if (!data || data.severity === undefined) return 'none'
    if (data.severity >= 3) return 'error'
    if (data.severity >= 1) return 'warning'
    return 'info'
  }, [data])

  // Calculate classes based on severity
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

  // Disconnected state
  if (isConnected === false) {
    return <div className={containerClasses}>{disconnectedComponent}</div>
  }

  // Loading state when we don't have data yet but are connected
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

  // Error state
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

  // Data value display when we don't have custom children
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

  // Render children when provided
  return <div className={containerClasses}>{children}</div>
}

// Optimalizace vykreslování pomocí React.memo
export default React.memo(WithErrorData) as typeof WithErrorData
