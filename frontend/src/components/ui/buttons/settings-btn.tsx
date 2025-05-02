import { SettingsIcon } from '../icons'
import styles from './setting-btn.module.css'

export const SettingsButton = () => {
  return (
    <button className={styles.button}>
      <SettingsIcon />
    </button>
  )
}
