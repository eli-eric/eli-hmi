import { FC, PropsWithChildren } from 'react'
import styles from './laser-grid.module.css'

/**
 * Responsive grid of laser panels. Each panel is a fixed rem width
 * (var(--hmi-panel-width)); the grid wraps, so the number of panels per row
 * adapts to the viewport — 1 per row on a phone, several on a monitor or TV.
 */
export const LaserGrid: FC<PropsWithChildren> = ({ children }) => {
  return <div className={styles.grid}>{children}</div>
}
