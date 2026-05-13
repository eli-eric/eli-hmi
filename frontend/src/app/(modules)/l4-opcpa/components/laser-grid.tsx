import { FC, PropsWithChildren } from 'react'
import styles from './laser-grid.module.css'

/**
 * 4-column CSS grid for stacking laser panels. With 5 lasers, the layout
 * wraps to 4 columns on the first row + 1 column on the second.
 * Each column has a minimum width so it never collapses past readability.
 */
export const LaserGrid: FC<PropsWithChildren> = ({ children }) => {
  return <div className={styles.grid}>{children}</div>
}
