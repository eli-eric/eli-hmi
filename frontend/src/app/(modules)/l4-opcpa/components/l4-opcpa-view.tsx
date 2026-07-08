'use client'

import { FC } from 'react'
import { useWebSocketContext } from '@/app/providers/socket-provider'
import { LaserGrid } from './laser-grid'
import { LaserPanelInstance } from './laser-panel-instance'
import type { LaserSpec } from '../config/schema'
import styles from '../page.module.css'

interface L4OpcpaViewProps {
  specs: readonly LaserSpec[]
}

/**
 * Client view for the L4 OPCPA page. Receives the validated per-laser specs
 * from the server `page.tsx` (which reads them from `lasers.yaml` at build
 * time) and renders the grid. Client because of the live connection banner.
 */
export const L4OpcpaView: FC<L4OpcpaViewProps> = ({ specs }) => {
  const { isConnected } = useWebSocketContext()
  return (
    <div className={styles.page}>
      <div className={styles.stickyHeader}>
        <header className={styles.header}>
          <h1 className={styles.title}>L4 OPCPA</h1>
        </header>
        {!isConnected && (
          <div className={styles.disconnected} role="status">
            WebSocket disconnected — values shown are last-known and may be
            stale.
          </div>
        )}
      </div>
      <LaserGrid>
        {specs.map((spec) => (
          <LaserPanelInstance key={spec.laser} spec={spec} />
        ))}
      </LaserGrid>
    </div>
  )
}
