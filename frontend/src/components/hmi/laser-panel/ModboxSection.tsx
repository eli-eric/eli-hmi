'use client'

import { FC, useMemo, useState } from 'react'
import { SectionCard } from '@/components/hmi/controls/SectionCard'
import { DataRow } from '@/components/hmi/controls/DataRow'
import { CogToggle } from '@/components/hmi/controls/CogToggle'
import { ActionButton } from '@/components/hmi/controls/ActionButton'
import {
  DetailList,
  DetailListItem,
} from '@/components/hmi/controls/DetailList'
import { StringValue } from '@/components/hmi/controls/Values'
import { ChevronIcon } from '@/components/ui/icons'
import { useWebSocketData } from '@/lib/websocket/use-websocket-data'
import { pv } from '@/app/(modules)/l4-opcpa/lib/pv-names'
import { WaveformSelect } from './WaveformSelect'
import styles from './sections.module.css'

interface ModboxSectionProps {
  laser: string
  /** Number of Modbox state sub-indicator PVs (BI_<laser>_MODBOX_1..N). */
  modboxStateCount: number
}

/**
 * Modbox (modulation box) status + actions + waveform control.
 *
 * Read PVs (mock):
 * - BI_<laser>_MODBOX_{i}         (state sub-indicators, 1=OK)
 * - SI_<laser>_LOADED_WAVEFORM    (currently loaded waveform name)
 *
 * Spec: "There are several Modbox state boolean indicators. This is a merged
 * indicator … Through a click it can be expanded in a list showing all
 * individual Modbox state boolean indicators."
 */
export const ModboxSection: FC<ModboxSectionProps> = ({
  laser,
  modboxStateCount,
}) => {
  const [expanded, setExpanded] = useState(false)

  const pvs = useMemo(
    () => pv.modboxStateAll(laser, modboxStateCount),
    [laser, modboxStateCount],
  )
  const { state } = useWebSocketData<number | null>({ pvs, raw: true })
  const okCount = pvs.filter((name) => state[name]?.value === 1).length
  const total = pvs.length
  const tone =
    total === 0
      ? 'unknown'
      : okCount === total
        ? 'positive-important'
        : okCount === 0
          ? 'negative-important'
          : 'negative-neutral'

  const items: DetailListItem[] = pvs.map((name, i) => {
    const msg = state[name]
    const v = msg?.value
    return {
      label: `Modbox ${i + 1}`,
      state: !msg ? 'unknown' : v === 1 ? 'ok' : 'err',
    }
  })

  return (
    <SectionCard>
      <DataRow
        label="Modbox State"
        valueVariant="bare"
        value={
          <button
            type="button"
            className={styles.modboxStateButton}
            aria-expanded={expanded}
            aria-label="Toggle Modbox state detail"
            onClick={() => setExpanded((v) => !v)}
          >
            <span className={styles.modboxStatePill} data-tone={tone}>
              <span className={styles.modboxStateCount}>
                {okCount} / {total}
              </span>
              <span className={styles.modboxStateChevron}>
                <ChevronIcon expanded={expanded} />
              </span>
            </span>
          </button>
        }
        action={
          <CogToggle ariaLabel="Modbox actions">
            <ActionButton
              label="Set Modbox ON"
              pvName={pv.cmd(laser, 'MODBOX_ON')}
            />
            <ActionButton
              label="Set Modbox OFF"
              pvName={pv.cmd(laser, 'MODBOX_OFF')}
              variant="secondary"
            />
          </CogToggle>
        }
      />
      {expanded && <DetailList items={items} />}
      <DataRow
        label="Loaded Waveform"
        value={<StringValue pvName={pv.loadedWaveform(laser)} />}
        action={
          <CogToggle ariaLabel="Set waveform">
            <WaveformSelect laser={laser} />
          </CogToggle>
        }
      />
    </SectionCard>
  )
}
