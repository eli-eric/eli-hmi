'use client'

import { FC, useMemo, useRef, useState } from 'react'
import { SectionCard } from '@/components/hmi/controls/SectionCard'
import { DataRow } from '@/components/hmi/controls/DataRow'
import { useWebSocketData } from '@/lib/websocket/use-websocket-data'
import { useCollapseOnAnyClick } from './use-collapse-on-any-click'
import styles from './sections.module.css'

/** One sequence shown in the expanded Sequencer list. */
export interface SequenceDescriptor {
  /** Human-readable name (e.g. "Start Laser"). */
  label: string
  /** PV carrying this sequence's state (1 = RUNNING, 0 = IDLE). */
  statePv: string
}

interface SequencerSectionProps {
  /** Sequencer running bool PV (1 = RUNNING, 0 = IDLE). */
  sequencerRunningPv: string
  /** Sequences shown (with per-sequence state PV) when expanded. */
  sequences: readonly SequenceDescriptor[]
}

/**
 * Default sequence set for L4 OPCPA, mapped to the backend sequence commands
 * (see LASER_COMMANDS / l4_opcpa.go `sequences`). The `id` is the command id;
 * the per-sequence state PV is derived from it via `pv.seqState`.
 *
 * Spec ("Sequencer"): a boolean IDLE/RUNNING that, on click, expands to a list
 * of all sequences with their individual state. The per-sequence state is a
 * proof-of-concept mock (no real per-sequence PV exists yet) — see pv.seqState.
 */
export const L4_OPCPA_SEQUENCES = [
  { label: 'Start Laser', id: 'START_LASER' },
  { label: 'Stop Laser', id: 'STOP_LASER' },
  { label: 'Set to Alignment Mode', id: 'ALIGNMENT_MODE' },
  { label: 'Set to System Standby', id: 'SYSTEM_STANDBY' },
  { label: 'Set All Flashlamps to Run', id: 'FLASHLAMPS_RUN' },
  { label: 'Set All Flashlamps to Standby', id: 'FLASHLAMPS_STANDBY' },
] as const

/**
 * Sequencer status. A single state pill (RUNNING / IDLE) that expands — per the
 * spec, the Sequencer is an expandable element — to list every sequence with
 * its own IDLE/RUNNING state. Collapses on any click in the app.
 */
export const SequencerSection: FC<SequencerSectionProps> = ({
  sequencerRunningPv,
  sequences,
}) => {
  const [expanded, setExpanded] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  useCollapseOnAnyClick(expanded, () => setExpanded(false), triggerRef)

  const pvs = useMemo(
    () => [sequencerRunningPv, ...sequences.map((s) => s.statePv)],
    [sequencerRunningPv, sequences],
  )
  const { state } = useWebSocketData<number | null>({ pvs, raw: true })

  const msg = state[sequencerRunningPv]
  const running = !msg || !msg.ok || msg.value === null ? null : msg.value === 1

  const label = running === null ? '<>' : running ? 'RUNNING' : 'IDLE'
  const tone =
    running === null
      ? 'unknown'
      : running
        ? 'positive-important'
        : 'negative-neutral'

  return (
    <SectionCard>
      <DataRow
        label="Sequencer"
        valueVariant="bare"
        value={
          <button
            ref={triggerRef}
            type="button"
            className={styles.modboxStateButton}
            aria-expanded={expanded}
            aria-label="Toggle Sequencer detail"
            onClick={() => setExpanded((v) => !v)}
          >
            <span className={styles.modboxStatePill} data-tone={tone}>
              <span className={styles.modboxStateCount}>{label}</span>
              <span
                className={styles.cornerTriangle}
                data-expanded={expanded || undefined}
                aria-hidden
              />
            </span>
          </button>
        }
      />
      {expanded && (
        <ul className={styles.sequenceList}>
          {sequences.map(({ label: name, statePv }) => {
            const m = state[statePv]
            const seqRunning =
              !m || !m.ok || m.value === null ? null : m.value === 1
            const seqText =
              seqRunning === null ? '<>' : seqRunning ? 'RUNNING' : 'IDLE'
            const seqTone =
              seqRunning === null
                ? 'unknown'
                : seqRunning
                  ? 'positive-important'
                  : 'negative-neutral'
            return (
              <li key={statePv} className={styles.sequenceItem}>
                <span>{name}</span>
                <span className={styles.sequenceState} data-tone={seqTone}>
                  {seqText}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </SectionCard>
  )
}
