'use client'

import { FC, useMemo, useRef, useState } from 'react'
import { SectionCard } from '@/components/hmi/controls/SectionCard'
import { DataRow } from '@/components/hmi/controls/DataRow'
import { CogToggle } from '@/components/hmi/controls/CogToggle'
import { ActionButton } from '@/components/hmi/controls/ActionButton'
import { PresetIntegerInput } from '@/components/hmi/controls/PresetIntegerInput'
import {
  DetailList,
  DetailListItem,
} from '@/components/hmi/controls/DetailList'
import { useWebSocketData } from '@/lib/websocket/use-websocket-data'
import { severityTone } from '@/lib/websocket/severity'
import { pv, type LaserCommand } from '@/app/(modules)/l4-opcpa/lib/pv-names'
import type { LabeledPv } from '@/app/(modules)/l4-opcpa/config/schema'
import { makeCommandGate } from './commandGate'
import { useCollapseOnAnyClick } from './use-collapse-on-any-click'
import { severityToDetailState } from './severity-detail-state'
import styles from './sections.module.css'

interface FlashlampsSectionProps {
  /** Laser id — used only to build command PVs. */
  laser: string
  /** Flashlamp channels: display label + state PV. */
  flashlamps: readonly LabeledPv[]
  /** Trigger-delay readout PVs; all should read equal (mismatch is flagged). */
  triggerDelay: readonly string[]
  /** Trigger-delay preset values (ns). */
  delayPresets: readonly number[]
  /** Commands this laser exposes. Buttons for commands not listed are hidden. */
  commands: readonly LaserCommand[]
}

const STATES = ['SB', 'RUN', 'STOP', 'FAIL'] as const
type FlashlampState = (typeof STATES)[number]

// The PV delivers the full enum name (STANDBY, IGNITION, STOP, RUN, FAILURE,
// BUSY, OFF). Only four of those currently have a dedicated count column /
// tone; STANDBY and FAILURE map onto the existing SB/FAIL buckets, RUN and
// STOP already match verbatim. IGNITION, BUSY, OFF have no bucket yet —
// `readState` returns null for them (not counted, no dedicated tone), but the
// raw string is still shown per-channel (see `channelItems`).
const STATE_ALIASES: Record<string, FlashlampState> = {
  STANDBY: 'SB',
  RUN: 'RUN',
  STOP: 'STOP',
  FAILURE: 'FAIL',
}

function readState(value: unknown): FlashlampState | null {
  if (typeof value !== 'string') return null
  return STATE_ALIASES[value.toUpperCase()] ?? null
}

function toneForState(
  state: FlashlampState,
  count: number,
): 'positive-important' | 'negative-neutral' | 'error' | undefined {
  if (count === 0) return undefined
  if (state === 'RUN') return 'positive-important'
  // A non-zero FAIL count is a MAJOR-severity condition — use the same
  // 'error' tone as an EPICS MAJOR alarm everywhere else in the panel,
  // not the lighter/generic 'negative-important'.
  if (state === 'FAIL') return 'error'
  return 'negative-neutral'
}

/**
 * Flashlamp channel states + lifecycle actions + trigger delay. All PV names
 * arrive as props (resolved from the YAML config); command PVs use `laser`.
 *
 * Trigger delay: the spec says the readouts should always be equal. We
 * subscribe to all `triggerDelay` PVs and flag a mismatch if any differ.
 */
export const FlashlampsSection: FC<FlashlampsSectionProps> = ({
  laser,
  flashlamps,
  triggerDelay,
  delayPresets,
  commands,
}) => {
  const [expanded, setExpanded] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  useCollapseOnAnyClick(expanded, () => setExpanded(false), triggerRef)
  const can = makeCommandGate(commands)
  const hasFlashlampActions = can('FLASHLAMPS_RUN') || can('FLASHLAMPS_STANDBY')

  const channelPvs = useMemo(() => flashlamps.map((f) => f.pv), [flashlamps])
  const channelLabels = useMemo(
    () => flashlamps.map((f) => f.label),
    [flashlamps],
  )

  const allPvs = useMemo(
    () => [...channelPvs, ...triggerDelay],
    [channelPvs, triggerDelay],
  )
  const { state } = useWebSocketData<string | number | null>({
    pvs: allPvs,
    raw: true,
  })

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
    const sev = severityTone(msg)
    // EPICS severity (or a disconnected/errored PV) overrides the
    // value-derived state, same as everywhere else in the panel.
    if (sev !== 'none') {
      return { label: channelLabels[i], state: severityToDetailState(sev) }
    }
    // `sev === 'none'` guarantees a message exists and is ok; only its VALUE
    // TYPE might still be wrong (contract violation).
    const raw = typeof msg!.value === 'string' ? msg!.value : null
    if (raw === null) {
      return { label: channelLabels[i], state: 'unknown' }
    }
    const s = readState(raw)
    // A valid string with no dedicated bucket yet (IGNITION, BUSY, OFF) gets
    // `neutral` — same plain style as before, no new colour.
    const itemState = s
      ? (s.toLowerCase() as 'sb' | 'run' | 'stop' | 'fail')
      : 'neutral'
    return {
      label: channelLabels[i],
      state: itemState,
      // Always show the raw incoming enum string.
      trailing: raw,
    }
  })

  // Trigger Delay: all readouts should be equal (spec). Flag if they differ.
  // These PVs have no alarm limits configured (no MINOR/MAJOR expected), but
  // INVALID severity (or a disconnected channel) on any of them still means
  // the reading can't be trusted, and takes priority over the mismatch check.
  const delayInvalid = triggerDelay.some(
    (name) => severityTone(state[name]) === 'invalid',
  )
  const delayVals = triggerDelay.map((name) => {
    const v = state[name]?.value
    return typeof v === 'number' ? Math.round(v) : null
  })
  const allKnown = delayVals.length > 0 && delayVals.every((v) => v !== null)
  const known = delayVals.filter((v): v is number => v !== null)
  const delayMismatch = allKnown && new Set(known).size > 1
  let delayDisplay: React.ReactNode
  if (delayInvalid) {
    delayDisplay = <span className={styles.delayInvalid}>INVALID</span>
  } else if (!allKnown) {
    delayDisplay = <span data-tone="unknown">&lt;&gt;</span>
  } else if (delayMismatch) {
    delayDisplay = (
      <span className={styles.delayMismatch} title={known.join(' / ')}>
        MISMATCH {known.join('/')}
      </span>
    )
  } else {
    delayDisplay = <span>{known[0]}</span>
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
          ref={triggerRef}
          type="button"
          className={styles.flashlampStateButton}
          aria-expanded={expanded}
          aria-label="Toggle Flashlamps channel detail"
          onClick={() => setExpanded((v) => !v)}
        >
          <span>Flashlamps State</span>
          <span
            className={styles.cornerTriangle}
            data-expanded={expanded || undefined}
            aria-hidden
          />
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
                label="Set All to Run"
                pvName={pv.cmd(laser, 'FLASHLAMPS_RUN')}
              />
            )}
            {can('FLASHLAMPS_STANDBY') && (
              <ActionButton
                label="Set All to Standby"
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
