import { FC, PropsWithChildren, ReactNode } from 'react'
import styles from './container-card.module.css'

interface ContainerCardProps {
  label: string
  children?: ReactNode
}
export const CardTitle: FC<PropsWithChildren<ContainerCardProps>> = ({
  label,
  children,
}) => {
  return (
    <div className={styles.card} style={{ width: '100%' }}>
      <div className={styles.titleContainer}>
        <span className={styles.title}>{label}</span>
        {children}
      </div>
    </div>
  )
}
