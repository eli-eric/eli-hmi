'use client'

import { FC, PropsWithChildren } from 'react'
import commonStyles from '../styles/common.module.css'

/**
 * MultiVolumePanel - Container for multiple volume panels
 *
 * Arranges multiple volume panels in a horizontal layout with proper spacing
 */
export const MultiVolumePanel: FC<PropsWithChildren> = ({ children }) => {
  return <div className={commonStyles.multiVolumeContainer}>{children}</div>
}
