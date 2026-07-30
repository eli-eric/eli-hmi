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
  const { navigationItems, homeRoute } = useRuntimeConfig()
  const handleSignOut = () => signOut({ callbackUrl: '/auth/signin' })

  // Zone data resolves a moment after first paint (see runtime-config
  // context) — render the shell immediately and let nav items pop in rather
  // than guessing a home route or blocking the whole page. This is purely
  // cosmetic: the actual route gate is enforced server-side in middleware.ts.
  // Items/home come from /api/runtime-config, which resolves the zone file
  // server-side (client components cannot fs-read the config dir).
  const items = navigationItems

  return (
    <nav className={styles.container}>
      <div className={styles.logoGroup}>
        <NavigationLogo href={homeRoute} />
        <TextButton text="sign out" onClick={handleSignOut} />
      </div>
      {items.map((item) => (
        <NavigationItem href={item.href} text={item.text} key={item.href} />
      ))}
    </nav>
  )
}
