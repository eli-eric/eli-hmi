'use client'

import { FC, PropsWithChildren, ButtonHTMLAttributes } from 'react'
import { ContentCard } from '@/components/ui/cards'
import { CardTitle } from '@/components/ui/cards/card-title'
import { ClearButton } from '@/components/ui/buttons'

import styles from './meter.module.css'

/**
 * Title component for meter displays
 */
interface MeterTitleProps {
  label: string
  children?: React.ReactNode
}

export const MeterTitle: FC<MeterTitleProps> = ({ label, children }) => {
  return <CardTitle label={label}>{children}</CardTitle>
}

/**
 * Button component for meter title actions
 */
interface MeterTitleButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tooltipContent?: string
  isProcessing?: boolean
  timeout?: number
}

export const MeterTitleButton: FC<MeterTitleButtonProps> = (props) => {
  return <ClearButton {...props} />
}

/**
 * Label component for meter displays
 */
interface MeterLabelProps {
  label: string
}

export const MeterLabel: FC<MeterLabelProps> = ({ label }) => {
  return (
    <div className={styles.labelContainer}>
      <span>{label}</span>
    </div>
  )
}

/**
 * Card component for meter content
 */
export const MeterCard: FC<PropsWithChildren> = ({ children }) => {
  return <ContentCard>{children}</ContentCard>
}

/**
 * Label component for meter cards
 */
export const MeterCardLabel: FC<PropsWithChildren> = ({ children }) => {
  return <div className={styles.cardTitle}>{children}</div>
}
