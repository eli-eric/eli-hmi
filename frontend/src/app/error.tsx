'use client'

import React from 'react'
import styles from './global-error.module.css'

// This is for errors in route segments and their children
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className={styles.errorContainer}>
      <h1 className={styles.errorHeader}>Error</h1>
      
      <p className={styles.errorMessage}>
        Page failed to load. {error.message}
      </p>
      
      <button
        onClick={() => reset()}
        className={styles.resetButton}
      >
        Retry
      </button>
      
      <pre className={styles.errorCode}>
        {error.message}
      </pre>
    </div>
  )
}