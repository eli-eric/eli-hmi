import { FC } from 'react'
import styles from './gate.module.css'
import { withReactWebSocketData } from '../with-websocket-data'
import { Message } from '@/app/providers/types'
import Link from 'next/link'

interface GateProps {
  name: string
  label: string
  data?: Message<number> | null
  href: string
  isConnected?: boolean
}

const GateLink: FC<GateProps> = ({ isConnected, href, name, data, label }) => {
  const value = isConnected
    ? `${data?.value.toExponential(2)} ${data?.units}`
    : 'N/A'

  return (
    <Link href={href}>
      <div className={styles.container}>
        <div className={styles.name}>{name}</div>
        <div className={styles.valueContainer}>
          <div className={styles.label}>{value}</div>
          <div className={styles.label}>{label}</div>
        </div>
      </div>
    </Link>
  )
}

export const Gate = withReactWebSocketData(GateLink)
