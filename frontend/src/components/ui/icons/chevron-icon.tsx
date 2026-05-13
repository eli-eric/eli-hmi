import { FC } from 'react'
import styles from './icon.module.css'

interface ChevronIconProps {
  /** Rotate 180° to indicate the parent is expanded. */
  expanded?: boolean
}

/**
 * Down-pointing chevron used as an "expand to reveal more" affordance.
 * Pass `expanded` to rotate it 180° (CSS transition).
 */
export const ChevronIcon: FC<ChevronIconProps> = ({ expanded = false }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 12 12"
      fill="none"
      className={styles.chevronIcon}
      data-expanded={expanded || undefined}
      width="12"
      height="12"
      aria-hidden
    >
      <path
        d="M2.5 4.5L6 8L9.5 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
