import { CheckIcon, CloseIcon } from '../icons'
import styles from './list-item.module.css'

export const ListItem = ({
  title,
  value,
  isConnected,
}: {
  title: string
  value?: boolean
  isConnected: boolean
}) => {
  return (
    <div className={styles.item}>
      <span>{title}</span>
      <IconsStatus value={value} isConnected={isConnected} />
    </div>
  )
}

const IconsStatus = ({
  value,
  isConnected,
}: {
  value?: boolean
  isConnected: boolean
}) => {
  if (isConnected === false) {
    return <span>N/A</span>
  }
  if (value === true) {
    return <CheckIcon />
  }
  if (value === false) {
    return <CloseIcon />
  }
  return <span>N/A</span>
}
