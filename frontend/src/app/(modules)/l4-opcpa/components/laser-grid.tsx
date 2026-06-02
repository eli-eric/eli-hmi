import { FC, PropsWithChildren } from 'react'
import styles from './laser-grid.module.css'

/**
 * Responsive, centered auto-fit grid of laser panels. Each panel sizes between
 * 300px and a readable 480px cap and the track group is centered, so a lone
 * panel doesn't float against the left edge and multiple panels spread without
 * left-clustering. On constrained / iPad viewports it collapses to a single
 * centered column (one panel at a time via the PanelSwitcher). Horizontal
 * overflow is caught by the global .page-container scroll container.
 */
export const LaserGrid: FC<PropsWithChildren> = ({ children }) => {
  return <div className={styles.grid}>{children}</div>
}
