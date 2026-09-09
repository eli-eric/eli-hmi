'use client'

import clsx from 'clsx'
import Link from 'next/link'
import { signOut } from 'next-auth/react'

import { TextButton } from '../ui/buttons'

import { NavigationItem } from './navigation-item'
import { PaletteSelect } from './palette-select'
import { useRuntimeConfig } from '@/lib/runtime-config/context'

import styles from './navigation-bar.module.css'
import navItemStyles from './navigation-item.module.css'

/**
 * Station name + link home. Both come from the zone file: the name from
 * `title`, the link from the first allowed route. They were independent once —
 * the name hardcoded as "E3 VACUUM SYSTEM" while the link followed the zone —
 * so an OPCPA station announced itself as the vacuum system.
 *
 * Renders nothing until the config resolves, rather than flashing a guess.
 */
const NavigationLogo = ({
  href,
  title,
}: {
  href: string | null
  title: string | null
}) => {
  if (!title) return null
  const label = (
    <span className={clsx(navItemStyles.item, navItemStyles.logo)}>
      {title}
    </span>
  )
  return href ? <Link href={href}>{label}</Link> : label
}

export default function NavigationBar() {
  // Items/home come from /api/runtime-config, which resolves the zone file
  // server-side (client components cannot fs-read the config dir). They are
  // empty/null until the fetch resolves shortly after first paint — the
  // shell renders immediately and nav items pop in. Purely cosmetic: the
  // actual route gate is enforced server-side in proxy.ts.
  const { navigationItems, homeRoute, title } = useRuntimeConfig()
  const handleSignOut = () => signOut({ callbackUrl: '/auth/signin' })

  return (
    // Clicks in the header leave the panel's expanded drop-downs alone: this
    // is chrome, not panel content, and the palette selector in particular is
    // reached for while inspecting those very indicators.
    <nav className={styles.container} data-collapse-exempt>
      <div className={styles.logoGroup}>
        <NavigationLogo href={homeRoute} title={title} />
        <TextButton text="sign out" onClick={handleSignOut} />
      </div>
      {navigationItems.map((item) => (
        <NavigationItem href={item.href} text={item.text} key={item.href} />
      ))}
      <PaletteSelect />
    </nav>
  )
}
