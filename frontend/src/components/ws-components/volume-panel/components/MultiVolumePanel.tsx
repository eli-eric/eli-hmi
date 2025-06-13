'use client'

import { FC, PropsWithChildren } from 'react'
import styles from './MultiVolumePanel.module.css'

/**
 * MultiVolumePanel - Container for multiple volume panels
 *
 * Arranges multiple volume panels in a horizontal layout with proper spacing
 */
export const MultiVolumePanel: FC<PropsWithChildren> = ({ children }) => {
  return <div className={styles.volumePanel__multiVolume}>{children}</div>
}
