'use client'

import { FC, PropsWithChildren } from 'react'
import styles from './card.module.css'

interface CardProps {
  title?: string
  width?: string
}

/**
 * Card component for containing content with an optional title
 */
export const Card: FC<PropsWithChildren<CardProps>> = ({ 
  children, 
  title,
  width
}) => {
  return (
    <div className={styles.card} style={{ width }}>
      {title && <div className={styles.title}>{title}</div>}
      <div className={styles.content}>{children}</div>
    </div>
  )
}
