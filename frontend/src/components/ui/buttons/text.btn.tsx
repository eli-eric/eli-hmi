'use client'

import { ButtonHTMLAttributes, FC } from 'react'
import clsx from 'clsx'
import styles from './text.btn.module.css'
import { Tooltip } from '../tooltip/tooltip'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  text: string
  tooltipContent?: string
  isProcessing?: boolean
  timeout?: number
}

export const TextButton: FC<Props> = ({
  className,
  text,
  isProcessing,
  children,
  timeout,
  ...props
}) => {
  if (isProcessing) {
    return (
      <span className={styles.processing}>{`Processing... ${timeout} s`}</span>
    )
  }

  return (
    <button {...props} className={clsx(styles.button, className)}>
      <div className={styles.layout}>
        <span className={styles.span}>{text}</span>
        {children}
      </div>
    </button>
  )
}

interface ClearButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tooltipContent?: string
  isProcessing?: boolean
  timeout?: number
}

export const ClearButton: FC<ClearButtonProps> = ({
  tooltipContent,
  ...props
}) => {
  return (
    <TextButton {...props} text="Check/Clear">
      <Tooltip content={tooltipContent}>
        <div className={styles.icon}>
          <span>?</span>
        </div>
      </Tooltip>
    </TextButton>
  )
}
