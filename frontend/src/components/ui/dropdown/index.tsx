'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import React, { ReactNode, useRef } from 'react'
import styles from './dropdown.module.css'
import containerStyles from './dropdown-container.module.css'

interface DropdownProps {
  items: DropdownItem[]
  renderTrigger: () => ReactNode
  disabled?: boolean
}

export interface DropdownItem {
  label: string
  onClick?: () => void
  disabled?: boolean
}

const ItemWrapper = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>((props, forwardedRef) => (
  <div ref={forwardedRef} {...props} className={styles.item} />
))

ItemWrapper.displayName = 'ItemWrapper'

export default function Dropdown({
  items,
  renderTrigger,
  disabled = false,
}: DropdownProps) {
  const triggerRef = useRef<HTMLDivElement>(null)

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild disabled={disabled}>
        <div
          ref={triggerRef}
          className={`${styles.trigger} ${containerStyles.container}`}
          aria-label="Dropdown menu"
        >
          {renderTrigger()}
        </div>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={styles.content}
          align={'start'}
          side={'bottom'}
        >
          {items.map((item, index) => (
            <DropdownMenu.Item
              key={index}
              asChild
              onSelect={() => {
                item.onClick?.()
              }}
              disabled={item.disabled}
            >
              <ItemWrapper>{item.label}</ItemWrapper>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
