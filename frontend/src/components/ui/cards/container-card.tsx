import { FC, PropsWithChildren } from 'react'
import styles from './container-card.module.css'
import { VolumeTitle } from '@/components/ws-components/volume-panel'

interface ContainerCardProps {
  width?: string
  title?: string
}
export const ContainerCard: FC<PropsWithChildren<ContainerCardProps>> = ({
  children,
  width = '100%',
  title,
}) => {
  return (
    <div className={styles.card} style={{ width }}>
      {title && <VolumeTitle label={title} />}
      {children}
    </div>
  )
}
