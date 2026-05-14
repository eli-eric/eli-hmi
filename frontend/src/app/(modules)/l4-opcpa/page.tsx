'use client'

import { useWebSocketContext } from '@/app/providers/socket-provider'
import { LaserGrid } from './components/laser-grid'
import { ColorLegend } from './components/color-legend'
import { LaserPanelInstance } from './components/laser-panel-instance'
import { LASER_SPECS } from './components/laser-specs'
import styles from './page.module.css'

export default function L4OpcpaPage() {
  const { isConnected } = useWebSocketContext()
  return (
    <div className={styles.page}>
      <div className={styles.stickyHeader}>
        <header className={styles.header}>
          <h1 className={styles.title}>L4 OPCPA</h1>
          <ColorLegend />
        </header>
        {!isConnected && (
          <div className={styles.disconnected} role="status">
            WebSocket disconnected — values shown are last-known and may be stale.
          </div>
        )}
      </div>
      <LaserGrid>
        {LASER_SPECS.map((spec) => (
          <LaserPanelInstance key={spec.laser} spec={spec} />
        ))}
      </LaserGrid>
    </div>
  )
}
