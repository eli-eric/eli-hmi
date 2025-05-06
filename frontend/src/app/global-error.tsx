'use client'

import React, { useEffect, useState } from 'react'
import styles from './global-error.module.css'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [errorDetails, setErrorDetails] = useState<string>('')

  useEffect(() => {
    // Log error to console for debugging
    console.error('Application error:', error)
    
    // Format error details for display
    const details = [
      `Message: ${error.message}`,
      `Stack: ${error.stack || 'No stack trace available'}`,
      error.digest ? `Digest: ${error.digest}` : '',
    ].filter(Boolean).join('\n')
    
    setErrorDetails(details)
  }, [error])

  return (
    <html>
      <body>
        <div className={styles.errorContainer}>
          <h1 className={styles.errorHeader}>Error</h1>
          
          <p className={styles.errorMessage}>
            Application crashed. {error.message}
          </p>
          
          <button
            onClick={() => reset()}
            className={styles.resetButton}
          >
            Reload
          </button>
          
          {errorDetails && (
            <pre className={styles.errorCode}>
              {errorDetails}
            </pre>
          )}
        </div>
      </body>
    </html>
  )
}