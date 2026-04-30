import { FC, PropsWithChildren, ReactNode } from 'react'
import commonStyles from '../../styles/common.module.css'

interface ContainerCardProps {
  label: string
  children?: ReactNode
}
export const CardTitle: FC<PropsWithChildren<ContainerCardProps>> = ({
  label,
  children,
}) => {
  return (
    <div className={commonStyles.card} style={{ width: '100%' }}>
      <div className={commonStyles.titleContainer}>
        <span className={commonStyles.textTitle}>{label}</span>
        {children}
      </div>
    </div>
  )
}
