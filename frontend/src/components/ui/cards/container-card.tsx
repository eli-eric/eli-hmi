import { FC, PropsWithChildren } from 'react'
import styles from './container-card.module.css'

interface ContainerCardProps {
  width?: string
}
export const ContainerCard: FC<PropsWithChildren<ContainerCardProps>> = ({
  children,
  width = '100%',
}) => {
  return (
    <div className={styles.card} style={{ width }}>
      {children}
    </div>
  )
}
