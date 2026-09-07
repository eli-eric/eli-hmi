'use client'

import clsx from 'clsx'
import React, { useEffect, useMemo } from 'react'

import { ErrorIcon } from '@/components/ui/icons'
import { Message } from '@/app/providers/types'

import { severityTone } from './severity'
import { severityPresentation } from './severity-presentation'
import styles from './pv-display.module.css'

export type SeverityLevel = 'warning' | 'error' | 'invalid' | 'unknown' | 'none'

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
  /** Set false to ignore EPICS severity styling. Default true. */
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
  showSeverity = true,
}: PVDisplayProps<T>) {
  useEffect(() => {
    if (data && !data.ok && onError) onError(data.error)
  }, [data, onError])

  // Severity comes from the shared table, so this matches the rest of the app:
  // MINOR(1) → warning, MAJOR(2) → error, INVALID(3) or `ok: false` → invalid.
  // The level is read straight from `severityTone` (it is the same union as
  // `SeverityLevel`); the presentation table is used only for the tooltip,
  // since this component predates the panel's tone layer and keeps its own
  // `severity*` classes.
  const severityLevel: SeverityLevel = useMemo(() => severityTone(data), [data])
  const { title: severityTitle } = useMemo(
    () => severityPresentation(data),
    [data],
  )

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

  // Names the PV and its last trustworthy value when the reading is invalid.
  const title = showSeverity ? severityTitle : undefined

  if (isConnected === false) {
    return (
      <div className={containerClasses} title={title}>
        {disconnectedComponent}
      </div>
    )
  }

  if (data == null) {
    if (loadingComponent) {
      return (
        <div className={containerClasses} title={title}>
          {loadingComponent}
        </div>
      )
    }
    return (
      <div className={clsx(containerClasses, styles.loadingDots)} title={title}>
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </div>
    )
  }

  if (data && data.ok === false) {
    if (errorComponent) {
      return (
        <div className={containerClasses} title={title}>
          {errorComponent}
        </div>
      )
    }
    return (
      <div className={containerClasses} title={title}>
        <span>N/A</span>
        <ErrorIcon message={data.error} className={styles.errorIcon} />
      </div>
    )
  }

  if (!children && data) {
    return (
      <div className={containerClasses} title={title}>
        <span>{`${
          data.value !== null && data.value !== undefined
            ? formatValue?.(data.value) || data.value
            : 'N/A'
        }`}</span>
        {data.units && <span>{` ${data.units}`}</span>}
      </div>
    )
  }

  return (
    <div className={containerClasses} title={title}>
      {children}
    </div>
  )
}

export const PVDisplay = React.memo(PVDisplayInner) as typeof PVDisplayInner
