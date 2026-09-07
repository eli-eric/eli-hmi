'use client'

import { FC, useMemo } from 'react'
import { SectionCard } from '@/components/hmi/controls/SectionCard'
import { useWebSocketData } from '@/lib/websocket/use-websocket-data'
import { resolveUnits } from '@/lib/websocket/units'
import type {
  ChillerSpec,
  UnitsConfig,
} from '@/app/(modules)/l4-opcpa/config/schema'
import { FloatValue } from '@/components/hmi/controls/Values'
import styles from './sections.module.css'

interface ChillersSectionProps {
  /** One entry per chiller: display label + flow/temp/level PV names. */
  chillers: readonly ChillerSpec[]
  /** Configured units per signal role; each wins over PV metadata. */
  units?: UnitsConfig
}

/**
 * Chiller flow/temp/water-level grid. One row per chiller, three columns
 * (Flow / Temp / Water) plus a header row. PV names arrive verbatim from the
 * YAML config.
 *
 * The cells are ordinary `FloatValue` readouts in tone-surface cells, like
 * every other number in the panel. They used to run their own state machine
 * (`chiller-cell-state.ts`) with private tones and its own idea of "out of
 * range" — that is what made them the only readouts in the panel that looked
 * different from the rest. Range checking belongs to the IOC, which raises
 * HIHI/LOLO as EPICS alarms that the shared table already paints.
 */
export const ChillersSection: FC<ChillersSectionProps> = ({
  chillers,
  units = {},
}) => {
  const pvs = useMemo(
    () => chillers.flatMap((c) => [c.flow, c.temp, c.level]),
    [chillers],
  )
  const { state } = useWebSocketData<number | null>({ pvs, raw: true })

  // A chiller cell is only ~3.9rem wide — a value like "24.810" already fills
  // it — so the unit goes in the column header once instead of on every cell.
  // Metadata is read from the first chiller's PV for that quantity; they are
  // the same physical quantity across chillers.
  const first = chillers[0]
  const header = (
    label: string,
    configured: string | undefined,
    pvName: string | undefined,
  ) => {
    const unit = resolveUnits({
      config: configured,
      metadata: pvName ? state[pvName]?.units : undefined,
    })
    return unit ? `${label} (${unit})` : label
  }

  return (
    <SectionCard>
      <div className={styles.chillerGrid}>
        <span />
        <span className={styles.colHeader}>
          {header('Flow', units.chillerFlow, first?.flow)}
        </span>
        <span className={styles.colHeader}>
          {header('Temp', units.chillerTemp, first?.temp)}
        </span>
        <span className={styles.colHeader}>
          {header('Water', units.chillerLevel, first?.level)}
        </span>

        {chillers.map((c) => (
          <div key={c.flow} className={styles.contents}>
            <span className={styles.rowLabel}>Chiller {c.label}</span>
            <span className={styles.numCell} data-tone-surface="cell">
              <FloatValue data={state[c.flow]} />
            </span>
            <span className={styles.numCell} data-tone-surface="cell">
              <FloatValue data={state[c.temp]} />
            </span>
            <span className={styles.numCell} data-tone-surface="cell">
              <FloatValue data={state[c.level]} />
            </span>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}
