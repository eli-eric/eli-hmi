'use client'

import React from 'react'
import styles from './icon.module.css'
import { Tooltip } from '../tooltip/tooltip'
import clsx from 'clsx'

interface ErrorIconProps {
  message?: string | null
  className?: string
}

export const ErrorIcon: React.FC<ErrorIconProps> = ({
  message = 'Error',
  className,
}) => {
  return (
    <Tooltip content={message} delayDuration={200} side="top">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="10"
        height="10"
        className={clsx(styles.errorIcon, className)}
        viewBox="0 0 24 24"
        fill="none"
      >
        <path
          d="M12 5.99L19.53 19H4.47L12 5.99M12 2L1 21h22L12 2zm1 14h-2v2h2v-2zm0-6h-2v4h2v-4z"
          fill="currentColor"
        />
      </svg>
    </Tooltip>
  )
}
