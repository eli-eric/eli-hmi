'use client'

import { FC, useMemo, useState } from 'react'
import { SectionCard } from '@/components/hmi/controls/SectionCard'
import { DataRow } from '@/components/hmi/controls/DataRow'
import { BoolPill } from '@/components/hmi/controls/Values'
import {
  DetailList,
  DetailListItem,
} from '@/components/hmi/controls/DetailList'
import { ChevronIcon } from '@/components/ui/icons'
import { useWebSocketData } from '@/lib/websocket/use-websocket-data'
import type { LabeledPv } from '@/app/(modules)/l4-opcpa/config/schema'
import styles from './sections.module.css'

interface SequencerSectionProps {
  /** Sequencer state PV (1 = RUNNING, 0 = IDLE). Optional — when absent the
   * row renders the unknown placeholder (<>). */
  sequencerPv?: string
  /** Per-sequence state indicators for the expanded list. Optional/empty →
   * the row is NOT expandable (no configured sequence detail to show). */
  sequences?: readonly LabeledPv[]
}

/**
 * Sequencer status row at the top of the panel. Per the spec it shows whether
 * the sequencer is IDLE or RUNNING, and (only when per-sequence detail PVs are
 * configured) can be expanded into a list of all sequences with their current
 * state. No sequencer PVs are invented here: absent config → unknown (<>),
 * non-expandable.
 */
export const SequencerSection: FC<SequencerSectionProps> = ({
  sequencerPv,
  sequences,
}) => {
  const [expanded, setExpanded] = useState(false)
  const expandable = (sequences?.length ?? 0) > 0

  const allPvs = useMemo(
    () =>
      [sequencerPv, ...(sequences?.map((s) => s.pv) ?? [])].filter(
        (p): p is string => Boolean(p),
      ),
    [sequencerPv, sequences],
  )
  const { state } = useWebSocketData<number | null>({ pvs: allPvs, raw: true })

  const stateMsg = sequencerPv ? state[sequencerPv] : undefined

  const items: DetailListItem[] = (sequences ?? []).map(
    ({ label, pv: name }) => {
      const msg = state[name]
      const known = msg && msg.ok
      return {
        label,
        state: !known ? 'unknown' : msg.value === 1 ? 'run' : 'sb',
        trailing: !known ? undefined : msg.value === 1 ? 'RUNNING' : 'IDLE',
      }
    },
  )

  const pill = (
    <BoolPill
      data={stateMsg}
      onLabel="RUNNING"
      offLabel="IDLE"
      onTone="positive-important"
      offTone="positive-neutral"
    />
  )

  return (
    <SectionCard>
      <DataRow
        label="Sequencer"
        valueVariant="bare"
        value={
          expandable ? (
            <button
              type="button"
              className={styles.flashlampStateButton}
              aria-expanded={expanded}
              aria-label="Toggle sequencer detail"
              onClick={() => setExpanded((v) => !v)}
            >
              <span>{pill}</span>
              <span className={styles.flashlampStateChevron}>
                <ChevronIcon expanded={expanded} />
              </span>
            </button>
          ) : (
            pill
          )
        }
      />
      {expandable && expanded && <DetailList items={items} />}
    </SectionCard>
  )
}
