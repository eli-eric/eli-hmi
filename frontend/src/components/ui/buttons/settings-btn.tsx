import { ButtonHTMLAttributes, FC } from 'react'
import { SettingsIcon } from '../icons'
import styles from './settings-btn.module.css'
import clsx from 'clsx'

// Add any additional props you want to pass to the button

export const SettingsButton: FC<ButtonHTMLAttributes<HTMLButtonElement>> = ({
  className,
  ...props
}) => {
  return (
    <button {...props} className={clsx(styles.button, className)}>
      <SettingsIcon />
    </button>
  )
}
