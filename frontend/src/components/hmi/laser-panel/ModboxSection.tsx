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
import { FloatValue, StringValue } from '@/components/hmi/controls/Values'
import type { Message } from '@/app/providers/types'
import { ChevronIcon } from '@/components/ui/icons'
import { useWebSocketData } from '@/lib/websocket/use-websocket-data'
import { pv, type LaserCommand } from '@/app/(modules)/l4-opcpa/lib/pv-names'
import { WaveformSelect } from './WaveformSelect'
import { makeCommandGate } from './commandGate'
import styles from './sections.module.css'

interface ModboxSectionProps {
  /** Laser id — used only to build command PVs. */
  laser: string
  /** Modbox state PVs (1 = OK) — merged into the BOOL count. */
  modbox: readonly string[]
  /** Currently-loaded (latest) waveform PV. */
  loadedWaveformPv: string
  /** Modbox State MBC1 float readout. Optional — absent → unknown (<>). */
  mbc1Pv?: string
  /** Modbox State MBC2 float readout. Optional — absent → unknown (<>). */
  mbc2Pv?: string
  /** Preset (next-launch) waveform PV. Optional — absent → unknown (<>). */
  waveformPresetPv?: string
  /** Commands this laser exposes. Buttons for commands not listed are hidden. */
  commands: readonly LaserCommand[]
}

/**
 * Modbox (modulation box) status + actions + waveform control. PV names arrive
 * as props (resolved from the YAML config); command PVs use `laser`.
 */
export const ModboxSection: FC<ModboxSectionProps> = ({
  laser,
  modbox,
  loadedWaveformPv,
  mbc1Pv,
  mbc2Pv,
  waveformPresetPv,
  commands,
}) => {
  const [expanded, setExpanded] = useState(false)
  const can = makeCommandGate(commands)
  const hasModboxActions = can('MODBOX_ON') || can('MODBOX_OFF')

  const allPvs = useMemo(
    () =>
      [
        ...modbox,
        loadedWaveformPv,
        mbc1Pv,
        mbc2Pv,
        waveformPresetPv,
      ].filter((p): p is string => Boolean(p)),
    [modbox, loadedWaveformPv, mbc1Pv, mbc2Pv, waveformPresetPv],
  )
  // Mixed value types (number for state, string for waveform). Keep the hook
  // typed as `unknown` and narrow at the use site.
  const { state } = useWebSocketData<unknown>({ pvs: allPvs, raw: true })
  const okCount = modbox.filter(
    (name) => state[name]?.value === 1,
  ).length
  const total = modbox.length
  const tone =
    total === 0
      ? 'unknown'
      : okCount === total
        ? 'positive-important'
        : okCount === 0
          ? 'negative-important'
          : 'negative-neutral'

  const items: DetailListItem[] = modbox.map((name, i) => {
    const msg = state[name]
    const v = msg?.value
    return {
      label: `Modbox ${i + 1}`,
      state: !msg ? 'unknown' : v === 1 ? 'ok' : 'err',
      trailing: !msg ? undefined : v === 1 ? 'YES' : 'NO',
    }
  })

  return (
    <SectionCard>
      {/* BOOL (merged, expandable) + MBC1 / MBC2 float readouts, laid out as
          columns to match the wireframe. MBC1/MBC2 fall back to the unknown
          placeholder (<>) until their PVs are configured. */}
      <div className={styles.modboxGrid}>
        <span />
        <span className={styles.colHeader}>BOOL</span>
        <span className={styles.colHeader}>MBC1</span>
        <span className={styles.colHeader}>MBC2</span>

        <div className={styles.contents}>
          <span className={styles.rowLabel}>Modbox State</span>
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
          <span className={styles.numCell}>
            <FloatValue
              data={
                mbc1Pv
                  ? (state[mbc1Pv] as Message<number | null> | undefined)
                  : undefined
              }
              precision={3}
            />
          </span>
          <span className={styles.numCell}>
            <FloatValue
              data={
                mbc2Pv
                  ? (state[mbc2Pv] as Message<number | null> | undefined)
                  : undefined
              }
              precision={3}
            />
          </span>
        </div>
      </div>
      {expanded && <DetailList items={items} />}
      <DataRow
        label="Waveform Preset"
        value={
          <StringValue
            data={
              waveformPresetPv
                ? (state[waveformPresetPv] as Message<string | null> | undefined)
                : undefined
            }
          />
        }
      />
      <DataRow
        label="Waveform Latest"
        value={
          <StringValue
            data={state[loadedWaveformPv] as Message<string | null> | undefined}
          />
        }
        action={
          can('LOAD_WAVEFORM') ? (
            <CogToggle ariaLabel="Set waveform">
              <WaveformSelect laser={laser} />
            </CogToggle>
          ) : undefined
        }
      />

      {hasModboxActions && (
        <div className={styles.actionRow}>
          <CogToggle ariaLabel="Modbox actions" inlineLabel="Modbox Actions">
            {can('MODBOX_ON') && (
              <ActionButton
                label="Set Modbox ON"
                pvName={pv.cmd(laser, 'MODBOX_ON')}
              />
            )}
            {can('MODBOX_OFF') && (
              <ActionButton
                label="Set Modbox OFF"
                pvName={pv.cmd(laser, 'MODBOX_OFF')}
                variant="secondary"
              />
            )}
          </CogToggle>
        </div>
      )}
    </SectionCard>
  )
}
