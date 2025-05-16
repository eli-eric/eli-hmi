'use client'

import { FC } from 'react'
import styles from '../styles/volume-panel.module.css'

/**
 * Props for the VolumeLabel component
 */
interface VolumeLabelProps {
  /**
   * The label text to display
   */
  label: string
}

/**
 * VolumeLabel - Label component for VolumePanel
 *
 * Displays a label with a consistent style
 */
export const VolumeLabel: FC<VolumeLabelProps> = ({ label }) => {
  return (
    <div className={styles.volumePanel__label}>
      <span className={styles.volumePanel__labelText}>{label}</span>
    </div>
  )
}
