'use client'
import clsx from 'clsx'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FC } from 'react'
import styles from './navigation-item.module.css'

interface NavigationItemProps {
  text: string
  href: string
}

export const NavigationItem: FC<NavigationItemProps> = ({ text, href }) => {
  const pathName = usePathname()
  const isActive = pathName === href

  return (
    <Link href={href}>
      <span
        className={clsx(styles.item, {
          [styles.active]: isActive,
        })}
      >
        {text}
      </span>
    </Link>
  )
}