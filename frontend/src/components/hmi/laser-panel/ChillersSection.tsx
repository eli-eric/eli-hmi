'use client'

import { FC, useMemo } from 'react'
import { SectionCard } from '@/components/hmi/controls/SectionCard'
import { useWebSocketData } from '@/lib/websocket/use-websocket-data'
import type { ChillerSpec } from '@/app/(modules)/l4-opcpa/config/schema'
import { ChillerCell } from './ChillerCell'
import { CHILLER_LIMITS } from './chiller-cell-state'
import styles from './sections.module.css'

interface ChillersSectionProps {
  /** One entry per chiller: display label + flow/temp/level PV names. */
  chillers: readonly ChillerSpec[]
}

/**
 * Chiller flow/temp/water-level grid. One row per chiller, three columns
 * (Flow / Temp / Water) plus a header row. PV names arrive verbatim from the
 * YAML config. Each cell resolves an explicit state (CSI-783) via ChillerCell.
 */
export const ChillersSection: FC<ChillersSectionProps> = ({ chillers }) => {
  const pvs = useMemo(
    () => chillers.flatMap((c) => [c.flow, c.temp, c.level]),
    [chillers],
  )
  const { state, isConnected } = useWebSocketData<number | null>({
    pvs,
    raw: true,
  })

  return (
    <SectionCard>
      <div className={styles.chillerGrid}>
        <span />
        <span className={styles.colHeader}>Flow</span>
        <span className={styles.colHeader}>Temp</span>
        <span className={styles.colHeader}>Water</span>

        {chillers.map((c) => (
          <div key={c.flow} className={styles.contents}>
            <span className={styles.rowLabel}>Chiller {c.label}</span>
            <span className={styles.numCell}>
              <ChillerCell
                msg={state[c.flow]}
                isConnected={isConnected}
                limits={CHILLER_LIMITS.flow}
              />
            </span>
            <span className={styles.numCell}>
              <ChillerCell
                msg={state[c.temp]}
                isConnected={isConnected}
                limits={CHILLER_LIMITS.temp}
              />
            </span>
            <span className={styles.numCell}>
              <ChillerCell
                msg={state[c.level]}
                isConnected={isConnected}
                limits={CHILLER_LIMITS.level}
              />
            </span>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}
