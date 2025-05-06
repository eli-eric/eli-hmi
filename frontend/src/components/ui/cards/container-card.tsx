import { FC, PropsWithChildren, ReactNode } from 'react'
import styles from './container-card.module.css'

interface ContainerCardProps {
  title: string
  controller?: () => ReactNode
  width?: string
}
export const ContainerCard: FC<PropsWithChildren<ContainerCardProps>> = ({
  title,
  controller,
  children,
  width = '100%',
}) => {
  return (
    <div className={styles.card} style={{ width }}>
      <div className={styles.titleContainer}>
        <span className={styles.title}>{title}</span>
        {controller && <div className={styles.controller}>{controller()}</div>}
      </div>
      {children}
    </div>
  )
}
