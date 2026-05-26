'use client'

import { FC, useMemo, useState } from 'react'
import { SectionCard } from '@/components/hmi/controls/SectionCard'
import { DataRow } from '@/components/hmi/controls/DataRow'
import { CogToggle } from '@/components/hmi/controls/CogToggle'
import { ActionButton } from '@/components/hmi/controls/ActionButton'
import { PresetIntegerInput } from '@/components/hmi/controls/PresetIntegerInput'
import {
  DetailList,
  DetailListItem,
} from '@/components/hmi/controls/DetailList'
import { ChevronIcon } from '@/components/ui/icons'
import { useWebSocketData } from '@/lib/websocket/use-websocket-data'
import { pv, type LaserCommand } from '@/app/(modules)/l4-opcpa/lib/pv-names'
import styles from './sections.module.css'

interface FlashlampsSectionProps {
  laser: string
  /** Box ids e.g. ['22','23','24','25','26','27','28']. */
  boxIds: readonly string[]
  /** Flashlamp channels per box (CH1..CHn). Default 2. */
  channelsPerBox?: number
  /** Trigger-delay preset values (ns). */
  delayPresets: readonly number[]
  /** Commands this laser exposes. Omitted = all shown (default). */
  commands?: readonly LaserCommand[]
}

const STATES = ['SB', 'RUN', 'STOP', 'FAIL'] as const
type FlashlampState = (typeof STATES)[number]

function readState(value: unknown): FlashlampState | null {
  if (typeof value !== 'string') return null
  const upper = value.toUpperCase() as FlashlampState
  return (STATES as readonly string[]).includes(upper) ? upper : null
}

function toneForState(
  state: FlashlampState,
  count: number,
): 'positive-important' | 'negative-neutral' | 'negative-important' | undefined {
  if (count === 0) return undefined
  if (state === 'RUN') return 'positive-important'
  if (state === 'FAIL') return 'negative-important'
  return 'negative-neutral'
}

/**
 * Flashlamp channel states + lifecycle actions + trigger delay.
 *
 * Read PVs (mock):
 * - SI_<laser>_FL_<box>_CH1 / _CH2     (per-channel state: SB/RUN/STOP/FAIL)
 * - AI_<laser>_TRIG_DELAY_CH1 / _CH2   (trigger delay readout, integer ns)
 *
 * Spec: "There are 14 flashlamp channels … There are four merged indicators
 * (one per state) showing how many flashlamp channels are in the given state.
 * Through a click it can be expanded in a list showing all channels with
 * their respective current state."
 *
 * Spec for Trigger Delay: "There are two trigger delay readouts… They should
 * always be equal… If they are not equal, an error appears here."
 */
export const FlashlampsSection: FC<FlashlampsSectionProps> = ({
  laser,
  boxIds,
  channelsPerBox = 2,
  delayPresets,
  commands,
}) => {
  const [expanded, setExpanded] = useState(false)
  const can = (c: LaserCommand) => !commands || commands.includes(c)
  const hasFlashlampActions = can('FLASHLAMPS_RUN') || can('FLASHLAMPS_STANDBY')

  const channelPvs = useMemo(
    () => pv.flashlampChannelsAll(laser, boxIds, channelsPerBox),
    [laser, boxIds, channelsPerBox],
  )
  const channelLabels = useMemo(() => {
    const out: string[] = []
    for (const box of boxIds) {
      for (let ch = 1; ch <= channelsPerBox; ch++) {
        out.push(`${box} Ch${ch}`)
      }
    }
    return out
  }, [boxIds, channelsPerBox])

  const delayCh1Pv = pv.triggerDelay(laser, '1')
  const delayCh2Pv = pv.triggerDelay(laser, '2')

  const allPvs = useMemo(
    () => [...channelPvs, delayCh1Pv, delayCh2Pv],
    [channelPvs, delayCh1Pv, delayCh2Pv],
  )

  const { state } = useWebSocketData<string | number | null>({ pvs: allPvs, raw: true })

  const counts = useMemo(() => {
    const c: Record<FlashlampState, number> = { SB: 0, RUN: 0, STOP: 0, FAIL: 0 }
    for (const name of channelPvs) {
      const s = readState(state[name]?.value)
      if (s) c[s]++
    }
    return c
  }, [channelPvs, state])

  const channelItems: DetailListItem[] = channelPvs.map((name, i) => {
    const msg = state[name]
    const s = readState(msg?.value)
    const itemState = s
      ? (s.toLowerCase() as 'sb' | 'run' | 'stop' | 'fail')
      : 'unknown'
    return {
      label: channelLabels[i],
      state: itemState,
      trailing: s ?? '<>',
    }
  })

  // Trigger Delay: compare Ch1 vs Ch2 per spec.
  const ch1 = state[delayCh1Pv]
  const ch2 = state[delayCh2Pv]
  const ch1Num = typeof ch1?.value === 'number' ? Math.round(ch1.value) : null
  const ch2Num = typeof ch2?.value === 'number' ? Math.round(ch2.value) : null
  const delayMismatch =
    ch1Num !== null && ch2Num !== null && ch1Num !== ch2Num
  let delayDisplay: React.ReactNode
  if (ch1Num === null || ch2Num === null) {
    delayDisplay = <span data-tone="unknown">&lt;&gt;</span>
  } else if (delayMismatch) {
    delayDisplay = (
      <span className={styles.delayMismatch} title={`CH1=${ch1Num} CH2=${ch2Num}`}>
        MISMATCH {ch1Num}/{ch2Num}
      </span>
    )
  } else {
    delayDisplay = <span>{ch1Num}</span>
  }

  return (
    <SectionCard>
      <div className={styles.flashlampGrid}>
        <span className={styles.rowLabel} />
        {STATES.map((s) => (
          <span key={s} className={styles.colHeader}>
            {s}
          </span>
        ))}
        <span />

        <button
          type="button"
          className={styles.flashlampStateButton}
          aria-expanded={expanded}
          aria-label="Toggle Flashlamps channel detail"
          onClick={() => setExpanded((v) => !v)}
        >
          <span>Flashlamps State</span>
          <span className={styles.flashlampStateChevron}>
            <ChevronIcon expanded={expanded} />
          </span>
        </button>
        {STATES.map((s) => (
          <span
            key={s}
            className={styles.flashlampCell}
            data-tone={toneForState(s, counts[s])}
            data-testid={`count-${s}`}
          >
            {counts[s]}
          </span>
        ))}
        {hasFlashlampActions ? (
          <CogToggle ariaLabel="Flashlamps actions">
            {can('FLASHLAMPS_RUN') && (
              <ActionButton
                label="Set All Run"
                pvName={pv.cmd(laser, 'FLASHLAMPS_RUN')}
              />
            )}
            {can('FLASHLAMPS_STANDBY') && (
              <ActionButton
                label="Set All Standby"
                pvName={pv.cmd(laser, 'FLASHLAMPS_STANDBY')}
                variant="secondary"
              />
            )}
          </CogToggle>
        ) : (
          <span />
        )}
      </div>

      {expanded && <DetailList items={channelItems} />}

      <DataRow
        label="Trigger Delay"
        value={delayDisplay}
        action={
          can('SET_DELAY') ? (
            <CogToggle ariaLabel="Set trigger delay">
              <PresetIntegerInput
                label="Set Trigger Delay"
                presets={delayPresets}
                pvName={pv.cmd(laser, 'SET_DELAY')}
              />
            </CogToggle>
          ) : undefined
        }
      />
    </SectionCard>
  )
}
