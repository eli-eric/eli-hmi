'use client'
import { navigationItems } from '@/lib/settings/navigation'
import { NavigationItem } from './navigation-item'
import styles from './navigation-bar.module.css'
import navItemStyles from './navigation-item.module.css'
import clsx from 'clsx'
import { TextButton } from '../ui/buttons'
import { signOut } from 'next-auth/react'
import Link from 'next/link'

export default function NavigationBar() {
  function handleSignOut() {
    signOut({ callbackUrl: '/auth/signin' })
  }

  return (
    <nav className={styles.container}>
      <div>
        <Link href="/p3-controls">
          <span className={clsx(navItemStyles.item, navItemStyles.active)}>
            E3 VACUUM SYSTEM
          </span>
        </Link>
        <TextButton text="sign out" onClick={handleSignOut}></TextButton>
      </div>
      {navigationItems.map((item) => (
        <NavigationItem href={item.href} text={item.text} key={item.href} />
      ))}
    </nav>
  )
}
