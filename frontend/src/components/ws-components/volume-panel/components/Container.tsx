'use client'

import { FC, PropsWithChildren } from 'react'
import styles from '../styles/sensors.module.css'

/**
 * Props for the Container component
 */
interface ContainerProps {
  /**
   * Optional width for the container
   */
  width?: string

  /**
   * Optional gap between child elements
   */
  gap?: string
}

/**
 * Container - Flexible container for volume panel components
 *
 * Provides a consistent layout container with configurable width and spacing
 */
export const Container: FC<PropsWithChildren<ContainerProps>> = ({
  children,
  width,
  gap,
}) => {
  return (
    <div className={styles.sensor__pumpContainer} style={{ width, gap }}>
      {children}
    </div>
  )
}
