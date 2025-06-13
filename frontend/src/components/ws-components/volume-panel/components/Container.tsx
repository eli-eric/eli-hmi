'use client'

import { FC, PropsWithChildren } from 'react'
import commonStyles from '../styles/common.module.css'

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
 *
 * @param {ContainerProps} props - Properties for the container
 * @param {string} [props.width] - Optional width for the container
 * @param {string} [props.gap] - Optional gap between child elements
 * @returns {JSX.Element} Rendered container with children
 */
export const Container: FC<PropsWithChildren<ContainerProps>> = ({
  children,
  width,
  gap,
}) => {
  return (
    <div className={commonStyles.panelContainer} style={{ width, gap }}>
      {children}
    </div>
  )
}
