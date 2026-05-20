import { FC } from 'react'
import styles from '../styles/line.module.css'

interface LineProps {
  children: React.ReactNode
}

/**
 * Line component for ConnectorLine
 *
 * Provides a horizontal layout for connector line elements
 */
export const Line: FC<LineProps> = ({ children }) => {
  return <div className={styles.line}>{children}</div>
}
