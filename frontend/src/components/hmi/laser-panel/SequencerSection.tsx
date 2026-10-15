'use client'

import { FC, useMemo, useState } from 'react'
import { SectionCard } from '@/components/hmi/controls/SectionCard'
import { DataRow } from '@/components/hmi/controls/DataRow'
import { useWebSocketData } from '@/lib/websocket/use-websocket-data'
import { EPICS_SEVERITY, isUdf } from '@/lib/websocket/severity'
import type { Message } from '@/app/providers/types'
import {
  aggregateSeverityPresentation,
  severityPresentation,
} from '@/lib/websocket/severity-presentation'
import styles from './sections.module.css'

/** One sequence shown in the expanded Sequencer list. */
export interface SequenceDescriptor {
  /** Human-readable name (e.g. "Start Laser"). */
  label: string
  /** PV carrying this sequence's state (1 = RUNNING, 0 = IDLE). */
  statePv: string
}

interface SequencerSectionProps {
  /** What this row is called. */
  label?: string
  /** Sequences this laser runs, with the PV carrying each one's state. */
  sequences: readonly SequenceDescriptor[]
}

/**
 * Sequencer status. A single state pill (RUNNING / IDLE) that expands — per the
 * spec, the Sequencer is an expandable element — to list every sequence with
 * its own IDLE/RUNNING state. Collapses on any click in the app.
 *
 * The pill is derived from the list: a second PV repeating what the rows below
 * already say is a second thing that can be wrong, and the disagreement would
 * show as a pill contradicting its own list.
 */
/**
 * The same reading with "never run" forgiven.
 *
 * A sequence record is undefined — severity INVALID, status UDF — until the
 * control system runs it for the first time, so on a cold IOC every row would
 * read `PV INV` while nothing whatever is wrong. An indicator that cries wolf
 * every morning is worse than no indicator: it teaches an operator to look
 * past the one thing that means a reading cannot be trusted.
 *
 * Narrow on purpose: *why* the record is INVALID is what decides. UDF is the
 * expected state of a sequence nobody has run; INVALID for any other reason —
 * a failed scan, a broken link — is a real fault and passes through, as does
 * `ok: false`, a channel that is not there at all.
 */
const asRunAtLeastOnce = (
  msg: Message<number | null> | undefined,
): Message<number | null> | undefined =>
  msg && msg.ok && msg.severity === EPICS_SEVERITY.INVALID && isUdf(msg.status)
    ? { ...msg, severity: 0 }
    : msg

export const SequencerSection: FC<SequencerSectionProps> = ({
  sequences,
  label = 'Sequencer',
}) => {
  const [expanded, setExpanded] = useState(false)

  const pvs = useMemo(() => sequences.map((s) => s.statePv), [sequences])
  const { state, isConnected } = useWebSocketData<number | null>({
    pvs,
    raw: true,
  })

  const readings = useMemo(
    () => pvs.map((name) => asRunAtLeastOnce(state[name])),
    [pvs, state],
  )

  // RUNNING while any sequence is, IDLE when none is, `<>` until one reports.
  const reported = readings.filter((m) => m && m.ok && m.value !== null)
  const running =
    reported.length === 0 ? null : reported.some((m) => m?.value === 1)

  // RUNNING and IDLE are both normal operating states — neither is good news
  // or bad news on its own, so neither is coloured. Only the control system's
  // severity (or a dead link) tones this pill.
  const severity = aggregateSeverityPresentation(readings, { isConnected })
  const stateText =
    severity.text ?? (running === null ? '<>' : running ? 'RUNNING' : 'IDLE')

  return (
    <SectionCard>
      <DataRow
        label={label}
        valueVariant="bare"
        value={
          <button
            type="button"
            className={styles.modboxStateButton}
            aria-expanded={expanded}
            aria-label="Toggle Sequencer detail"
            onClick={() => setExpanded((v) => !v)}
          >
            <span
              className={styles.modboxStatePill}
              data-tone-surface="chip"
              data-tone={severity.tone}
              title={severity.title}
            >
              <span className={styles.modboxStateCount}>{stateText}</span>
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
            const m = asRunAtLeastOnce(state[statePv])
            const seqRunning =
              !m || !m.ok || m.value === null ? null : m.value === 1
            const seq = severityPresentation(m, {
              isConnected,
              pvName: statePv,
            })
            const seqText =
              seq.text ??
              (seqRunning === null ? '<>' : seqRunning ? 'RUNNING' : 'IDLE')
            return (
              <li key={statePv} className={styles.sequenceItem}>
                <span>{name}</span>
                <span
                  className={styles.sequenceState}
                  data-tone-surface="chip"
                  data-tone={seq.tone}
                  title={seq.title}
                >
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
