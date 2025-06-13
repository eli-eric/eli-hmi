'use client'

import { FC, PropsWithChildren } from 'react'
import commonStyles from '../../styles/common.module.css'

/**
 * Props for the VolumeCard component
 */
interface VolumeCardProps {
  /**
   * Optional title for the card
   */
  label?: string

  /**
   * Optional height for the card
   */
  height?: string
}

/**
 * VolumeCardLabel - Label component for VolumePanel cards
 */
export const VolumeCardLabel: FC<PropsWithChildren> = ({ children }) => {
  return <div className={commonStyles.textTitle}>{children}</div>
}

/**
 * VolumeCard - Card component for VolumePanel content
 *
 * Displays content in a card with optional title and height
 */
export const VolumeCard: FC<PropsWithChildren<VolumeCardProps>> = ({
  children,
  label,
  height,
}) => {
  return (
    <div className={commonStyles.innerCard} style={{ height }}>
      {label && <VolumeCardLabel>{label}</VolumeCardLabel>}
      {children}
    </div>
  )
}
