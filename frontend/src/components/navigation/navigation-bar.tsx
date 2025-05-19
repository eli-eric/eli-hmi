'use client'
import { navigationItems } from '@/lib/settings/navigation'
import { NavigationItem } from './navigation-item'
import styles from './navigation-bar.module.css'
import navItemStyles from './navigation-item.module.css'
import clsx from 'clsx'
import { TextButton } from '../ui/buttons'
import { signOut } from 'next-auth/react'

export default function NavigationBar() {
  function handleSignOut() {
    // Implement sign out logic here
    console.log('Signing out...')
    signOut()
  }

  return (
    <nav className={styles.container}>
      <div>
        <span className={clsx(navItemStyles.item, navItemStyles.active)}>
          E3 VACUUM SYSTEM
        </span>
        <TextButton text="sign out" onClick={handleSignOut}></TextButton>
      </div>
      {navigationItems.map((item) => (
        <NavigationItem href={item.href} text={item.text} key={item.href} />
      ))}
    </nav>
  )
}
