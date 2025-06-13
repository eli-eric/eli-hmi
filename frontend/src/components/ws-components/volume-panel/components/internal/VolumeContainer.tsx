import { FC, PropsWithChildren } from 'react'
import styles from './VolumeContainer.module.css'
import { ClearButton } from '@/components/ui/buttons'
import { CardTitle } from './card-title'

interface ContainerCardProps {
  width?: string
  title?: string
  checkClearPv?: string
}
export const VolumeContainer: FC<PropsWithChildren<ContainerCardProps>> = ({
  children,
  width = '100%',
  title,
  checkClearPv,
}) => {
  return (
    <div className={styles.card} style={{ width }}>
      {title && (
        <CardTitle label={title}>
          {/* TODO PUT pv function */}
          {checkClearPv && <ClearButton />}
        </CardTitle>
      )}
      {children}
    </div>
  )
}
