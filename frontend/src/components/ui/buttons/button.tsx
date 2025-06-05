'use client'

import { ButtonHTMLAttributes, FC, PropsWithChildren } from 'react'
import styles from './button.module.css'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline'
  size?: 'small' | 'medium' | 'large'
}

/**
 * Standard Button component
 */
export const Button: FC<PropsWithChildren<ButtonProps>> = ({ 
  children, 
  variant = 'primary',
  size = 'medium',
  className = '',
  ...rest
}) => {
  const buttonClass = `${styles.button} ${styles[variant]} ${styles[size]} ${className}`.trim()
  
  return (
    <button className={buttonClass} {...rest}>
      {children}
    </button>
  )
}
