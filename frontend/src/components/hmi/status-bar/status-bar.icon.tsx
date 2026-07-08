import { CheckIcon, CloseIcon } from '@/components/ui/icons'
import styles from './status-bar.module.css'
export const StatusBarIcon = ({ isConnected }: { isConnected: boolean }) => {
  return (
    <div className={styles.body}>
      <span className={styles.bodyText}>Server Connection</span>
      &nbsp;&nbsp;
      {isConnected ? <CheckIcon /> : <CloseIcon />}
    </div>
  )
}
