'use client'

import { FC, PropsWithChildren, ButtonHTMLAttributes } from 'react'
import { ContentCard } from '@/components/ui/cards'
import { CardTitle } from '@/components/ui/cards/card-title'
import { ClearButton } from '@/components/ui/buttons'

import styles from './volume-panel.module.css'

/**
 * Title component for VolumePanel displays
 */
interface VolumePanelTitleProps {
  label: string
  children?: React.ReactNode
}

export const VolumePanelTitle: FC<VolumePanelTitleProps> = ({
  label,
  children,
}) => {
  return <CardTitle label={label}>{children}</CardTitle>
}

/**
 * Button component for VolumePanel title actions
 */
interface VolumePanelTitleButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  tooltipContent?: string
  isProcessing?: boolean
  timeout?: number
}

export const VolumePanelTitleButton: FC<VolumePanelTitleButtonProps> = (
  props,
) => {
  return <ClearButton {...props} />
}

/**
 * Label component for VolumePanel displays
 */
interface VolumePanelLabelProps {
  label: string
}

export const VolumePanelLabel: FC<VolumePanelLabelProps> = ({ label }) => {
  return (
    <div className={styles.labelContainer}>
      <span>{label}</span>
    </div>
  )
}

/**
 * Card component for VolumePanel content
 */
export const VolumePanelCard: FC<PropsWithChildren> = ({ children }) => {
  return <ContentCard>{children}</ContentCard>
}

/**
 * Label component for VolumePanel cards
 */
export const VolumePanelCardLabel: FC<PropsWithChildren> = ({ children }) => {
  return <div className={styles.cardTitle}>{children}</div>
}
