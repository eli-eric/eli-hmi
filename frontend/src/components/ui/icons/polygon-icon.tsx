import clsx from 'clsx'
import style from './polygon-icon.module.css'
import Image from 'next/image'
import { FC } from 'react'

interface PolygonIconProps {
  className?: string
}

export const PolygonIcon: FC<PolygonIconProps> = ({ className }) => {
  return (
    <div className={clsx(style.container, className)}>
      <div className={style.line} />
      <Image
        src="/images/polygon.svg"
        alt="Polygon 1"
        className={clsx(style.polygonIcon)}
        width={80}
        height={44}
        priority
      />
      <div className={style.line} />
    </div>
  )
}
