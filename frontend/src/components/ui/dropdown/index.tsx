'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ReactNode, useState } from 'react'
import styles from './dropdown.module.css'
import containerStyles from './dropdown-container.module.css'
import { SettingsButton } from '../buttons'

interface DropdownProps {
  items: DropdownItem[]
  title?: string
  trigger?: ReactNode
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
  width?: string | number
}

export interface DropdownItem {
  label: string
  onClick?: () => void
  disabled?: boolean
}

export default function Dropdown({
  items,
  title = 'Settings',
  side = 'bottom',
  width,
}: DropdownProps) {
  const [open, setOpen] = useState(false)

  return (
    <div
      className={containerStyles.container}
      style={{ width: width || '100%' }}
    >
      <DropdownMenu.Root open={open} onOpenChange={setOpen}>
        <DropdownMenu.Trigger asChild>
          <div className={styles.trigger} aria-label="Dropdown menu">
            <span className={styles.title}>{title}</span>
            <SettingsButton />
          </div>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className={styles.content}
            align="center"
            alignOffset={0}
            side={side}
            sideOffset={0}
            avoidCollisions={false}
            loop={false}
          >
            {items.map((item, index) => (
              <DropdownMenu.Item
                key={index}
                className={styles.item}
                onClick={item.onClick}
                disabled={item.disabled}
              >
                {item.label}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  )
}
