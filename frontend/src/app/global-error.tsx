'use client'

import { useEffect } from 'react'
import styles from './global-error.module.css'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log error to console for debugging
    console.error('Application error:', error)
  }, [error])

  // Derived purely from `error`, so compute during render rather than mirroring
  // it into state via an effect (avoids the extra render + set-state-in-effect).
  const errorDetails = [
    `Message: ${error.message}`,
    `Stack: ${error.stack || 'No stack trace available'}`,
    error.digest ? `Digest: ${error.digest}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <html>
      <body>
        <div className={styles.errorContainer}>
          <h1 className={styles.errorHeader}>Error</h1>

          <p className={styles.errorMessage}>
            Application crashed. {error.message}
          </p>

          <button onClick={() => reset()} className={styles.resetButton}>
            Reload
          </button>

          {errorDetails && (
            <pre className={styles.errorCode}>{errorDetails}</pre>
          )}
        </div>
      </body>
    </html>
  )
}
