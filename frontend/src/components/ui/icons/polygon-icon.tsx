import clsx from 'clsx'
import style from './polygon-icon.module.css'

interface PolygonIconProps {
  className?: string
}
export const Polygon1 = ({ className }: PolygonIconProps) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="15"
      height="16"
      viewBox="0 0 15 16"
      fill="none"
      className={clsx(style.polygonIcon, className)}
    >
      <path d="M1 14L1 2L14 8L1 14Z" stroke="black" strokeWidth="1.25" />
    </svg>
  )
}

const Polygon2 = ({ className }: PolygonIconProps) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="15"
      height="16"
      viewBox="0 0 15 16"
      fill="none"
      className={clsx(style.polygonIcon, className)}
    >
      <path d="M14 2L14 14L1 8L14 2Z" stroke="black" strokeWidth="1.25" />
    </svg>
  )
}

export const ValveIcon = () => {
  return (
    <div className={style.valveIconContainer}>
      <div className={style.lineLeft} />
      <div className={style.polygonContainer}>
        <Polygon1 className={style.polygonLeft} />
        <Polygon2 className={style.polygonRight} />
      </div>
      <div className={style.lineRight} />
    </div>
  )
}
