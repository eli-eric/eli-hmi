'use client'

import { signOut } from 'next-auth/react'
import styles from './no-access.module.css'

export default function NoAccessPage() {
  function handleSignOut() {
    signOut({ callbackUrl: '/auth/signin' })
  }

  return (
    <div className={styles.centered}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1>Access Restricted</h1>
          <p className={styles.message}>
            You do not have access to any pages in the current zone configuration.
          </p>
          <p className={styles.subtitle}>
            Please contact your system administrator if you believe this is an error.
          </p>
        </div>
        <button onClick={handleSignOut} className={styles.signOutButton}>
          Sign Out
        </button>
      </div>
    </div>
  )
}
