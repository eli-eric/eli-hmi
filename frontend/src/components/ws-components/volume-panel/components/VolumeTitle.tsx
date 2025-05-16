'use client'

import { FC, ReactNode } from 'react'
import { CardTitle } from '@/components/ui/cards/card-title'

/**
 * Title component for VolumePanel displays
 */
interface VolumeTitleProps {
  /**
   * The label text to display in the title
   */
  label: string

  /**
   * Optional children elements (e.g., buttons)
   */
  children?: ReactNode
}

/**
 * VolumeTitle - Title component for VolumePanel
 *
 * Displays a title with optional child elements (typically buttons)
 */
export const VolumeTitle: FC<VolumeTitleProps> = ({ label, children }) => {
  return <CardTitle label={label}>{children}</CardTitle>
}
