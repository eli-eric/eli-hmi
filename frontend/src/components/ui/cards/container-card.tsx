import { FC, PropsWithChildren, ReactNode } from 'react'
import styles from './container-card.module.css'

interface ContainerCardProps {
  title: string
  controller?: () => ReactNode
}
export const ContainerCard: FC<PropsWithChildren<ContainerCardProps>> = ({
  title,
  controller,
  children,
}) => {
  return (
    <div className={styles.card}>
      <div className={styles.titleContainer}>
        <h3 className={styles.title}>{title}</h3>
        {controller && <div className={styles.controller}>{controller()}</div>}
      </div>
      {children}
    </div>
  )
}
