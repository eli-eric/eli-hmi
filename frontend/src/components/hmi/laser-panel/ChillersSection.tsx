'use client'

import { FC, useMemo } from 'react'
import { SectionCard } from '@/components/hmi/controls/SectionCard'
import { FloatValue } from '@/components/hmi/controls/Values'
import { useWebSocketData } from '@/lib/websocket/use-websocket-data'
import { pv } from '@/app/(modules)/l4-opcpa/lib/pv-names'
import styles from './sections.module.css'

interface ChillersSectionProps {
  laser: string
  /** Chiller ids from Confluence (e.g. ['11','12','13','14'] for NL2). */
  chillerIds: readonly string[]
}

/**
 * Chiller flow/temp/water-level grid. One row per chiller, three columns
 * (Flow / Temp / Water) plus a header row.
 *
 * PV pattern (mock):
 * - AI_<laser>_CHILLER_<id>_FLOW
 * - AI_<laser>_CHILLER_<id>_TEMP
 * - AI_<laser>_CHILLER_<id>_LEVEL
 */
export const ChillersSection: FC<ChillersSectionProps> = ({
  laser,
  chillerIds,
}) => {
  const pvs = useMemo(() => {
    const out: string[] = []
    for (const id of chillerIds) {
      out.push(
        pv.chillerFlow(laser, id),
        pv.chillerTemp(laser, id),
        pv.chillerLevel(laser, id),
      )
    }
    return out
  }, [laser, chillerIds])
  const { state } = useWebSocketData<number | null>({ pvs, raw: true })

  return (
    <SectionCard>
      <div className={styles.chillerGrid}>
        <span />
        <span className={styles.colHeader}>Flow</span>
        <span className={styles.colHeader}>Temp</span>
        <span className={styles.colHeader}>Water</span>

        {chillerIds.map((id) => (
          <div key={id} className={styles.contents}>
            <span className={styles.rowLabel}>Chiller PS1225:{id}</span>
            <span className={styles.numCell}>
              <FloatValue
                data={state[pv.chillerFlow(laser, id)]}
                precision={3}
              />
            </span>
            <span className={styles.numCell}>
              <FloatValue
                data={state[pv.chillerTemp(laser, id)]}
                precision={3}
              />
            </span>
            <span className={styles.numCell}>
              <FloatValue
                data={state[pv.chillerLevel(laser, id)]}
                precision={3}
              />
            </span>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}
