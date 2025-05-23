import clsx from 'clsx'
import { ErrorIcon } from '../ui/icons'
import styles from './with-error-data.module.css'
import { Message } from '@/app/providers/types'

interface WithErrorDataProps<T> {
  data?: Message<T | null> | null
  children?: React.ReactNode
  isConnected?: boolean
  formatValue?: (value: T) => string
}

export const WithErrorData = <T,>({
  data,
  children,
  isConnected = false,
  formatValue,
}: WithErrorDataProps<T>) => {
  console.log('WithErrorData: ', data?.name, { data, isConnected })
  if (isConnected === false) {
    return <span>N/A</span>
  }

  // Loading state when we don't have data yet but are connected
  if (data === undefined) {
    return (
      <div className={clsx(styles.withError, styles.loadingDots)}>
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </div>
    )
  }

  // Error state
  if (data && data.ok === false) {
    return (
      <div className={styles.withError}>
        <span>N/A</span>
        <ErrorIcon message={data.error} className={styles.errorIcon} />
      </div>
    )
  }

  // Data value display when we don't have custom children
  if (!children && data) {
    return (
      <div className={styles.withError}>
        <span>{`${
          data.value ? formatValue?.(data.value) || data.value : 'N/A'
        }`}</span>
        {data.units && <span>{` ${data.units}`}</span>}
      </div>
    )
  }

  // Render children when provided
  return <div className={styles.withError}>{children}</div>
}
