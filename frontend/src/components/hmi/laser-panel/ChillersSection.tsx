'use client'

import { FC, useMemo } from 'react'
import { SectionCard } from '@/components/hmi/controls/SectionCard'
import { FloatValue } from '@/components/hmi/controls/Values'
import { useWebSocketData } from '@/lib/websocket/use-websocket-data'
import type { ChillerSpec } from '@/app/(modules)/l4-opcpa/config/schema'
import styles from './sections.module.css'

interface ChillersSectionProps {
  /** One entry per chiller: display label + flow/temp/level PV names. */
  chillers: readonly ChillerSpec[]
}

/**
 * Chiller flow/temp/water-level grid. One row per chiller, three columns
 * (Flow / Temp / Water) plus a header row. PV names arrive verbatim from the
 * YAML config.
 */
export const ChillersSection: FC<ChillersSectionProps> = ({ chillers }) => {
  const pvs = useMemo(
    () => chillers.flatMap((c) => [c.flow, c.temp, c.level]),
    [chillers],
  )
  const { state } = useWebSocketData<number | null>({ pvs, raw: true })

  return (
    <SectionCard>
      <div className={styles.chillerGrid}>
        <span />
        <span className={styles.colHeader}>Flow</span>
        <span className={styles.colHeader}>Temp</span>
        <span className={styles.colHeader}>Water</span>

        {chillers.map((c) => (
          <div key={c.label} className={styles.contents}>
            <span className={styles.rowLabel}>Chiller {c.label}</span>
            <span className={styles.numCell}>
              <FloatValue data={state[c.flow]} precision={3} />
            </span>
            <span className={styles.numCell}>
              <FloatValue data={state[c.temp]} precision={3} />
            </span>
            <span className={styles.numCell}>
              <FloatValue data={state[c.level]} precision={3} />
            </span>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}
