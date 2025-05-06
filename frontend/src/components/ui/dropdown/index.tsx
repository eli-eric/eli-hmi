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
  
  // Create a style object for the container with the width prop if provided
  // Removed width style, the component will adapt to its parent

  return (
    <div className={containerStyles.container}>
      <div onClick={() => setOpen(!open)} className={styles.trigger} aria-label="Dropdown menu">
        <span className={styles.title}>{title}</span>
        <SettingsButton />
      </div>

      {open && (
        <div className={styles.popoverContainer}>
          <div className={styles.content}>
            {items.map((item, index) => (
              <button
                key={index}
                className={styles.item}
                onClick={() => {
                  if (item.onClick) item.onClick();
                  setOpen(false);
                }}
                disabled={item.disabled}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
