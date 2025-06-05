import clsx from 'clsx'
import style from './polygon-icon.module.css'
import { FC } from 'react'

interface PolygonIconProps {
  className?: string
}

export const SimpleLine: FC<PolygonIconProps> = ({ className }) => {
  return (
    <div className={clsx(style.container, className)}>
      <div className={style.simple} />
    </div>
  )
}
