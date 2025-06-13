'use client'

import { FC } from 'react'
import styles from './VolumeTitle.module.css'

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
 * VolumeLabel - Label component for VolumePanel
 *
 * Displays a label with a consistent style
 */
export const VolumeTitle: FC<VolumeLabelProps> = ({ title }) => {
  return (
    <div className={styles.volumePanel__title}>
      <span className={styles.volumePanel__titleText}>{title}</span>
    </div>
  )
}
