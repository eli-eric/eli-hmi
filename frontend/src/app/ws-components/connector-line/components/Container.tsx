import { FC } from 'react'
import styles from '../styles/connector-line.module.css'

interface ContainerProps {
  children: React.ReactNode
}

/**
 * Container component for ConnectorLine
 *
 * Provides the main container for the connector line components
 */
export const Container: FC<ContainerProps> = ({ children }) => {
  return <div className={styles.connectorLine}>{children}</div>
}
