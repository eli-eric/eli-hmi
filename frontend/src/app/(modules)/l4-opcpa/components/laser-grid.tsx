import { FC, PropsWithChildren } from 'react'
import styles from './laser-grid.module.css'

/**
 * Responsive grid of laser panels. Each panel is a fixed rem width; the grid
 * wraps, so the number of panels per row adapts to the viewport — one per
 * row on a phone, the full set on a wide control-room display.
 */
export const LaserGrid: FC<PropsWithChildren> = ({ children }) => {
  return <div className={styles.grid}>{children}</div>
}
