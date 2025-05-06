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
  console.log(isConnected, 'list item')
  return (
    <div className={styles.item}>
      <span>{title}</span>
      {value === true && <CheckIcon />}
      {value === false && <CloseIcon />}
      {isConnected === false && <span>N/A</span>}
    </div>
  )
}
