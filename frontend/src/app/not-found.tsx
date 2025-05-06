'use client'

import React from 'react'
import styles from './global-error.module.css'
import Link from 'next/link'

export default function NotFound() {
  return (
    <div className={styles.errorContainer}>
      <h1 className={styles.errorHeader}>Error</h1>
      
      <p className={styles.errorMessage}>
        Page not found. The requested page does not exist.
      </p>
      
      <Link href="/">
        <button className={styles.resetButton}>
          Go to Home
        </button>
      </Link>
    </div>
  )
}