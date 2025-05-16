import { FC } from 'react'
import Link from 'next/link'
import { Message } from '@/app/providers/types'
import styles from '../styles/gate.module.css'

interface GateProps {
  name: string
  label: string
  data?: Message<number> | null
  href: string
  isConnected?: boolean
  pvname?: string
}

/**
 * Gate component
 *
 * Displays a gate with name, value, and label that links to another page
 */
export const Gate: FC<GateProps> = ({
  isConnected,
  href,
  name,
  data,
  label,
}) => {
  const value = isConnected
    ? `${data?.value.toExponential(2)} ${data?.units}`
    : 'N/A'

  return (
    <Link href={href}>
      <div className={styles.gate}>
        <div className={styles.gate__name}>{name}</div>
        <div className={styles.gate__valueContainer}>
          <div className={styles.gate__value}>{value}</div>
          <div className={styles.gate__label}>{label}</div>
        </div>
      </div>
    </Link>
  )
}
