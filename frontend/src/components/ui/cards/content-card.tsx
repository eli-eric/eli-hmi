import { FC, PropsWithChildren } from 'react'
import styles from './content-card.module.css'

interface Props {
  height?: string
}

export const ContentCard: FC<PropsWithChildren<Props>> = ({
  children,
  height,
}) => {
  return (
    <div className={styles.card} style={{ height }}>
      {children}
    </div>
  )
}
