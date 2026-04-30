'use client'

import clsx from 'clsx'
import Link from 'next/link'
import { signOut } from 'next-auth/react'

import { TextButton } from '../ui/buttons'

import { NavigationItem } from './navigation-item'
import { navigationItems } from '@/lib/settings/navigation'
import { getDefaultRoute } from '@/lib/settings/zone-service'

import styles from './navigation-bar.module.css'
import navItemStyles from './navigation-item.module.css'

const NavigationLogo = () => {
  const home = getDefaultRoute() ?? '/no-access'
  return (
    <Link href={home}>
      <span className={clsx(navItemStyles.item, navItemStyles.logo)}>
        E3 VACUUM SYSTEM
      </span>
    </Link>
  )
}

export default function NavigationBar() {
  const handleSignOut = () => signOut({ callbackUrl: '/auth/signin' })

  return (
    <nav className={styles.container}>
      <div className={styles.logoGroup}>
        <NavigationLogo />
        <TextButton text="sign out" onClick={handleSignOut} />
      </div>
      {navigationItems.map((item) => (
        <NavigationItem href={item.href} text={item.text} key={item.href} />
      ))}
    </nav>
  )
}
