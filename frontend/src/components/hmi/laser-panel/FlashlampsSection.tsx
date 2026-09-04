'use client'

import { CSSProperties, FC, useMemo, useRef, useState } from 'react'
import { SectionCard } from '@/components/hmi/controls/SectionCard'
import { DataRow } from '@/components/hmi/controls/DataRow'
import { CogToggle } from '@/components/hmi/controls/CogToggle'
import { ActionButton } from '@/components/hmi/controls/ActionButton'
import { PresetIntegerInput } from '@/components/hmi/controls/PresetIntegerInput'
import {
  DetailList,
  DetailListItem,
  DetailListItemState,
} from '@/components/hmi/controls/DetailList'
import { useWebSocketData } from '@/lib/websocket/use-websocket-data'
import {
  severityPresentation,
  aggregateSeverityPresentation,
} from '@/lib/websocket/severity-presentation'
import type {
  CommandPvResolver,
  LaserCommand,
} from '@/app/(modules)/l4-opcpa/lib/pv-names'
import type { LabeledPv } from '@/app/(modules)/l4-opcpa/config/schema'
import { makeCommandGate } from './commandGate'
import { useCollapseOnAnyClick } from './use-collapse-on-any-click'
import { severityToDetailState } from './severity-detail-state'
import styles from './sections.module.css'

interface FlashlampsSectionProps {
  /** Resolves a command to its write PV (YAML override or CMD_<laser>_<NAME>). */
  cmdPv: CommandPvResolver
  /** Flashlamp channels: display label + state PV. */
  flashlamps: readonly LabeledPv[]
  /** Trigger-delay readout PVs; all should read equal (mismatch is flagged). */
  triggerDelay: readonly string[]
  /** Trigger-delay preset values (ns). */
  delayPresets: readonly number[]
  /** Commands this laser exposes. Buttons for commands not listed are hidden. */
  commands: readonly LaserCommand[]
}

/**
 * Counted state columns. Capped at four by the row's width: a 22rem panel
 * minus the 8.5rem label and 2.25rem action column leaves ~2.4rem per cell,
 * about what a bold 4-character header needs. Adding a fifth column requires
 * shortening the headers or the label (see `.flashlampGrid` in the CSS) —
 * seven columns of 4-character headers would need a ~33rem panel.
 */
const STATES = ['SB', 'RUN', 'STOP', 'FAIL'] as const
type FlashlampState = (typeof STATES)[number]

// The PV delivers the full enum name (STANDBY, IGNITION, STOP, RUN, FAILURE,
// BUSY, OFF). Only these four have a count column: STANDBY and FAILURE map
// onto SB/FAIL, RUN and STOP match verbatim. IGNITION, BUSY and OFF are
// counted in no column and render `neutral` per-channel with their raw text
// still shown, so they stay visible in the expanded list (see `channelItems`).
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

/**
 * Per-channel DetailList tone for each counted state. Deliberately a total
 * `Record`, so adding a state to STATES forces a decision here (and a
 * matching tone in DetailList.module.css) rather than silently emitting a
 * `data-state` no CSS matches.
 */
const DETAIL_STATE_BY_FLASHLAMP_STATE: Record<
  FlashlampState,
  DetailListItemState
> = {
  SB: 'sb',
  RUN: 'run',
  STOP: 'stop',
  FAIL: 'fail',
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
 * arrive as props (resolved from the YAML config); command write PVs come
 * from `cmdPv`.
 *
 * Trigger delay: the spec says the readouts should always be equal. We
 * subscribe to all `triggerDelay` PVs and flag a mismatch if any differ.
 */
export const FlashlampsSection: FC<FlashlampsSectionProps> = ({
  cmdPv,
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
    const c: Record<FlashlampState, number> = {
      SB: 0,
      RUN: 0,
      STOP: 0,
      FAIL: 0,
    }
    for (const name of channelPvs) {
      const s = readState(state[name]?.value)
      if (s) c[s]++
    }
    return c
  }, [channelPvs, state])

  const channelItems: DetailListItem[] = channelPvs.map((name, i) => {
    const msg = state[name]
    const { tone, text, title } = severityPresentation(msg)
    // EPICS severity (or a disconnected/errored PV) overrides the
    // value-derived state, same as everywhere else in the panel.
    if (tone) {
      return {
        label: channelLabels[i],
        state: severityToDetailState(tone),
        trailing: text,
        title,
      }
    }
    // A severity-'none' message exists and is ok; only its VALUE TYPE might
    // still be wrong (contract violation).
    const raw = typeof msg!.value === 'string' ? msg!.value : null
    if (raw === null) {
      return { label: channelLabels[i], state: 'unknown' }
    }
    // Counted states get their own tone; anything else (IGNITION / BUSY / OFF,
    // or an unrecognised string) renders `neutral` — plain, no colour — with
    // the raw enum text still shown.
    const s = readState(raw)
    const itemState = s ? DETAIL_STATE_BY_FLASHLAMP_STATE[s] : 'neutral'
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
  const delaySeverity = aggregateSeverityPresentation(
    triggerDelay.map((name) => state[name]),
  )
  const delayVals = triggerDelay.map((name) => {
    const v = state[name]?.value
    return typeof v === 'number' ? Math.round(v) : null
  })
  const allKnown = delayVals.length > 0 && delayVals.every((v) => v !== null)
  const known = delayVals.filter((v): v is number => v !== null)
  const delayMismatch = allKnown && new Set(known).size > 1
  let delayDisplay: React.ReactNode
  if (delaySeverity.tone === 'invalid') {
    delayDisplay = (
      <span className={styles.delayInvalid} title={delaySeverity.title}>
        {delaySeverity.text}
      </span>
    )
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
      <div
        className={styles.flashlampGrid}
        // Keeps the grid's column count in step with STATES (see the CSS).
        style={{ '--flashlamp-state-count': STATES.length } as CSSProperties}
      >
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
                pvName={cmdPv('FLASHLAMPS_RUN')}
              />
            )}
            {can('FLASHLAMPS_STANDBY') && (
              <ActionButton
                label="Set All to Standby"
                pvName={cmdPv('FLASHLAMPS_STANDBY')}
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
                pvName={cmdPv('SET_DELAY')}
              />
            </CogToggle>
          ) : undefined
        }
      />
    </SectionCard>
  )
}
