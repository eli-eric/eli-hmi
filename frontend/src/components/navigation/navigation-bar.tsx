'use client'

import clsx from 'clsx'
import Link from 'next/link'
import { signOut } from 'next-auth/react'

import { TextButton } from '../ui/buttons'

import { NavigationItem } from './navigation-item'
import { useRuntimeConfig } from '@/lib/runtime-config/context'

import styles from './navigation-bar.module.css'
import navItemStyles from './navigation-item.module.css'

const NavigationLogo = ({ href }: { href: string | null }) => {
  const label = (
    <span className={clsx(navItemStyles.item, navItemStyles.logo)}>
      E3 VACUUM SYSTEM
    </span>
  )
  return href ? <Link href={href}>{label}</Link> : label
}

export default function NavigationBar() {
  // Items/home come from /api/runtime-config, which resolves the zone file
  // server-side (client components cannot fs-read the config dir). They are
  // empty/null until the fetch resolves shortly after first paint — the
  // shell renders immediately and nav items pop in. Purely cosmetic: the
  // actual route gate is enforced server-side in middleware.ts.
  const { navigationItems, homeRoute } = useRuntimeConfig()
  const handleSignOut = () => signOut({ callbackUrl: '/auth/signin' })

  return (
    <nav className={styles.container}>
      <div className={styles.logoGroup}>
        <NavigationLogo href={homeRoute} />
        <TextButton text="sign out" onClick={handleSignOut} />
      </div>
      {navigationItems.map((item) => (
        <NavigationItem href={item.href} text={item.text} key={item.href} />
      ))}
    </nav>
  )
}
