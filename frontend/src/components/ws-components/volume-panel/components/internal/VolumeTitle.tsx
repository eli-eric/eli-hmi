'use client'

import { FC } from 'react'
import commonStyles from '../../styles/common.module.css'

/**
 * Props for the VolumeLabel component
 */
interface VolumeLabelProps {
  /**
   * The label text to display
   */
  title: string
}

/**
 * VolumeTitle - Label component for VolumePanel
 *
 * Displays a title with a consistent style
 */
export const VolumeTitle: FC<VolumeLabelProps> = ({ title }) => {
  return (
    <div className={commonStyles.titleBar}>
      <span className={commonStyles.textNormal}>{title}</span>
    </div>
  )
}
