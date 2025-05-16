'use client'

import { FC, PropsWithChildren } from 'react'
import { ContentCard } from '@/components/ui/cards'
import styles from '../styles/volume-panel.module.css'

/**
 * Props for the VolumeCard component
 */
interface VolumeCardProps {
  /**
   * Optional title for the card
   */
  title?: string

  /**
   * Optional height for the card
   */
  height?: string
}

/**
 * VolumeCardLabel - Label component for VolumePanel cards
 */
export const VolumeCardLabel: FC<PropsWithChildren> = ({ children }) => {
  return <div className={styles.volumePanel__cardTitle}>{children}</div>
}

/**
 * VolumeCard - Card component for VolumePanel content
 *
 * Displays content in a card with optional title and height
 */
export const VolumeCard: FC<PropsWithChildren<VolumeCardProps>> = ({
  children,
  title,
  height,
}) => {
  return (
    <ContentCard height={height}>
      {title && <VolumeCardLabel>{title}</VolumeCardLabel>}
      {children}
    </ContentCard>
  )
}
