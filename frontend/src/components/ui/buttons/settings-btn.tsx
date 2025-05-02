import { ButtonHTMLAttributes, FC } from 'react'
import { SettingsIcon } from '../icons'
import styles from './setting-btn.module.css'

// Add any additional props you want to pass to the button
interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'active'
}

export const SettingsButton: FC<Props> = (props) => {
  return (
    <button
      {...props}
      className={`${styles.button} ${props.className} ${props.variant}`}
    >
      <SettingsIcon />
    </button>
  )
}
