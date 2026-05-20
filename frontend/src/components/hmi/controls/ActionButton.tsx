'use client'

import { FC, useCallback } from 'react'
import { usePvWrite } from './usePvWrite'
import styles from './ActionButton.module.css'

interface ActionButtonProps {
  label: string
  /** PV to write. Either a command trigger like `CMD_NL2_START_LASER` or
   * a direct PV like `BI_NL2_SHUTTER`. */
  pvName: string
  /** Value to write. Defaults to `1` (typical trigger for command PVs). */
  value?: number | string
  variant?: 'primary' | 'secondary' | 'danger'
}

export const ActionButton: FC<ActionButtonProps> = ({
  label,
  pvName,
  value = 1,
  variant = 'primary',
}) => {
  const { state, error, write } = usePvWrite()

  const onClick = useCallback(() => {
    if (state === 'pending') return
    void write(pvName, value)
  }, [state, write, pvName, value])

  return (
    <span className={styles.wrapper}>
      <button
        type="button"
        className={styles.button}
        data-state={state}
        data-variant={variant}
        disabled={state === 'pending'}
        onClick={onClick}
        title={state === 'error' && error ? error : undefined}
      >
        {label}
      </button>
      {state === 'error' && (
        <span
          className={styles.errorRow}
          role="alert"
          title={error ?? 'Failed'}
        >
          {error ?? 'Failed'}
        </span>
      )}
    </span>
  )
}
