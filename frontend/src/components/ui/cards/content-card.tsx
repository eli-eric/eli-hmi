import { FC, PropsWithChildren } from 'react'
import styles from './content-card.module.css'

export const ContentCard: FC<PropsWithChildren> = ({ children }) => {
  return <div className={styles.card}>{children}</div>
}
