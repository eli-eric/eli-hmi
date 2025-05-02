import { ButtonHTMLAttributes, FC } from 'react'
import { SettingsIcon } from '../icons'
import styles from './setting-btn.module.css'
import clsx from 'clsx'

// Add any additional props you want to pass to the button
interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'active'
}

export const SettingsButton: FC<Props> = ({
  variant = 'default',
  className,
  ...props
}) => {
  return (
    <button
      {...props}
      className={clsx(styles.button, styles[variant], className)}
    >
      <SettingsIcon />
    </button>
  )
}
