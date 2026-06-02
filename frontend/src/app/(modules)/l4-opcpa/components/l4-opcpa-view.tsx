'use client'

import { FC, useState } from 'react'
import { useWebSocketContext } from '@/app/providers/socket-provider'
import { LaserGrid } from './laser-grid'
import { LaserPanelInstance } from './laser-panel-instance'
import { PanelSwitcher } from './panel-switcher'
import type { LaserSpec } from '../config/schema'
import styles from '../page.module.css'

interface L4OpcpaViewProps {
  specs: readonly LaserSpec[]
}

/**
 * Client view for the L4 OPCPA page. Receives the validated per-laser specs
 * from the server `page.tsx` (which reads them from `lasers.yaml` at build
 * time) and renders the grid. Client because of the live connection banner.
 *
 * When more than one laser is rendered, a {@link PanelSwitcher} is shown; on
 * narrow viewports CSS collapses the grid to one panel at a time and the
 * switcher pages between them. With the single NL2 panel the switcher is not
 * rendered and the grid behaves exactly as before.
 */
export const L4OpcpaView: FC<L4OpcpaViewProps> = ({ specs }) => {
  const { isConnected } = useWebSocketContext()
  const [activeIndex, setActiveIndex] = useState(0)
  const multi = specs.length > 1
  const active = Math.min(activeIndex, specs.length - 1)

  return (
    <div className={styles.page}>
      <div className={styles.stickyHeader}>
        <header className={styles.header}>
          <h1 className={styles.title}>L4 OPCPA</h1>
        </header>
        {multi && (
          <PanelSwitcher
            labels={specs.map((spec) => spec.laser)}
            activeIndex={active}
            onChange={setActiveIndex}
          />
        )}
        {!isConnected && (
          <div className={styles.disconnected} role="status">
            WebSocket disconnected — values shown are last-known and may be
            stale.
          </div>
        )}
      </div>
      <LaserGrid>
        {specs.map((spec, i) =>
          multi ? (
            <div
              key={spec.laser}
              className={styles.panelSlot}
              data-active={i === active}
            >
              <LaserPanelInstance spec={spec} />
            </div>
          ) : (
            <LaserPanelInstance key={spec.laser} spec={spec} />
          ),
        )}
      </LaserGrid>
    </div>
  )
}
