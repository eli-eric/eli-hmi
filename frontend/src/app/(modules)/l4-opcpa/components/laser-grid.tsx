import { FC, PropsWithChildren } from 'react'
import styles from './laser-grid.module.css'

/**
 * Flex row of fixed-width (280px) laser panels.
 * Horizontal overflow is caught by the global .page-container scroll container.
 */
export const LaserGrid: FC<PropsWithChildren> = ({ children }) => {
  return <div className={styles.grid}>{children}</div>
}
