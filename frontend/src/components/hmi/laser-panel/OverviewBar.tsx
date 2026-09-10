'use client'

import { FC, ReactNode, useMemo, useState } from 'react'
import { useWebSocketData } from '@/lib/websocket/use-websocket-data'
import {
  DetailList,
  DetailListItem,
} from '@/components/hmi/controls/DetailList'
import type {
  LabeledPv,
  MappedPv,
} from '@/app/(modules)/l4-opcpa/config/schema'
import type { Message } from '@/app/providers/types'
import { severityTone } from '@/lib/websocket/severity'
import {
  severityPresentation,
  aggregateSeverityPresentation,
  type Tone,
} from '@/lib/websocket/severity-presentation'
import { displayValue, YES_NO_TEXT } from './value-text'
import styles from './OverviewBar.module.css'

interface OverviewBarProps {
  connectionPv: string
  fullPowerPv: string
  /** MSS sub-indicators: display label + full PV name, optional value map. */
  mss: readonly MappedPv[]
  /** Module-error indicators: display label + full PV name. */
  moduleErrors: readonly LabeledPv[]
}

const MSS_NOTE =
  'This is a selection of some MSS indicators, it is NOT an exhaustive list of all parameters that lead to the overall MSS indicator.'

const ERR_NOTE = 'Error code 0 means no error.'

/**
 * Four-cell header cluster at the top of the General box per the Confluence
 * wireframe: CONN, FULLP, MSS, ERR. MSS and ERR are clickable to expand a
 * per-item detail list (matches Description: "Through a click it can be
 * expanded in a list showing all individual MSS boolean indicators").
 */
export const OverviewBar: FC<OverviewBarProps> = ({
  connectionPv,
  fullPowerPv,
  mss,
  moduleErrors,
}) => {
  // One flag per list rather than one "which is open" selector: diagnosing a
  // failed MSS permission means reading it against the module-error codes, so
  // opening one must not close the other. Neither closes on its own — only the
  // operator's second click on the same pill does.
  const [mssExpanded, setMssExpanded] = useState(false)
  const [errExpanded, setErrExpanded] = useState(false)

  const mssPvs = useMemo(() => mss.map((m) => m.pv), [mss])
  const moduleErrorPvs = useMemo(
    () => moduleErrors.map((m) => m.pv),
    [moduleErrors],
  )
  const boolPvs = useMemo(
    () => [connectionPv, fullPowerPv, ...mssPvs],
    [connectionPv, fullPowerPv, mssPvs],
  )
  const { state, isConnected } = useWebSocketData<number | null>({
    pvs: boolPvs,
    raw: true,
  })
  // Module-error PVs report a string status code, not a boolean: "0000"
  // means OK, any other value is an active error.
  const { state: errState } = useWebSocketData<string | null>({
    pvs: moduleErrorPvs,
    raw: true,
  })

  const connMsg = state[connectionPv]
  const fullpMsg = state[fullPowerPv]

  // The aggregate pill's colour/text is driven by the worst EPICS severity
  // among its children first; only once every child is severity-'none' does
  // it fall back to the old value-based YES/NO or count logic. 'unknown'
  // (the "<>" placeholder) only wins when NO child has reported in yet —
  // one disconnected/errored (now 'invalid', not 'unknown') child is enough
  // to surface as a real problem instead of the cold-start placeholder.
  const mssTotal = mss.length
  const mssSeverity = aggregateSeverityPresentation(
    mss.map(({ pv: name }) => state[name]),
    { isConnected },
  )
  // "ok" means healthy AND unalarmed — otherwise the pill could read YES
  // while painted red for an alarmed child.
  const mssOk = mss.filter(
    ({ pv: name }) =>
      severityTone(state[name]) === 'none' && state[name]?.value === 1,
  ).length

  const errTotal = moduleErrors.length
  const errSeverity = aggregateSeverityPresentation(
    moduleErrors.map(({ pv: name }) => errState[name]),
    { isConnected },
  )
  const errUnknown = moduleErrors.filter(
    ({ pv: name }) => severityTone(errState[name]) === 'unknown',
  ).length
  const errOk = moduleErrors.filter(
    ({ pv: name }) =>
      severityTone(errState[name]) === 'none' &&
      errState[name]?.value === '0000',
  ).length
  const errCount = errTotal - errOk - errUnknown

  // Neither list colours by its own value (e.g. "is the bit 1" / "is the code
  // 0000") — tone and any replacement text come from the shared
  // `severityPresentation` table. Severity 0 shows the value, unstyled.
  const detailItem = (
    label: string,
    pvName: string,
    msg: Message<unknown> | undefined,
    values?: MappedPv['values'],
    defaults?: Record<string, string>,
  ): DetailListItem => {
    const { tone, text, title } = severityPresentation(msg, {
      isConnected,
      pvName,
    })
    return {
      label,
      tone,
      // The shared table replaces the text only when the reading is unusable.
      text: text ?? displayValue(msg?.value, values, defaults),
      title,
    }
  }

  // An MSS bit is a permission, so each row reads YES / NO — the same words as
  // the summary pill above it, which is the only way a row and its aggregate
  // can be read together at a glance. The config can override per indicator.
  const mssItems: DetailListItem[] = mss.map(({ label, pv: name, values }) =>
    detailItem(label, name, state[name], values, YES_NO_TEXT),
  )

  // Module errors are status codes ("0000" = no error), not booleans: there is
  // no vocabulary to translate them into, so they are shown as they arrive.
  const errItems: DetailListItem[] = moduleErrors.map(({ label, pv: name }) =>
    detailItem(label, name, errState[name]),
  )

  // Green when good, plain when bad. A red "NO" here would be the panel's own
  // opinion about a value the control system did not flag; if a failed MSS bit
  // or a non-zero error code is genuinely an alarm, the IOC says so through
  // severity and the tone above paints it. Absence of green is the signal.
  const mssTone: Tone | undefined =
    mssSeverity.tone ?? (mssOk === mssTotal ? 'positive-important' : undefined)
  // Severity supplies its own text where the shared table says so; otherwise
  // the spec's YES/NO overall word.
  const mssText = mssSeverity.text ?? (mssOk === mssTotal ? 'YES' : 'NO')

  const errTone: Tone | undefined =
    errSeverity.tone ?? (errCount === 0 ? 'positive-important' : undefined)

  return (
    <div className={styles.wrapper}>
      <div className={styles.row}>
        <span className={styles.rowLabel}>Overview</span>
        <div className={styles.grid}>
          <Cell label="CONN">
            <OverviewBoolCell
              pvName={connectionPv}
              data={connMsg}
              onText="YES"
              offText="NO"
              isConnected={isConnected}
            />
          </Cell>
          <Cell label="FULLP">
            <OverviewBoolCell
              pvName={fullPowerPv}
              data={fullpMsg}
              onText="YES"
              offText="NO"
              isConnected={isConnected}
            />
          </Cell>
          <Cell label="MSS">
            <button
              type="button"
              className={styles.pillButton}
              aria-expanded={mssExpanded}
              aria-label="Toggle MSS detail"
              onClick={() => setMssExpanded((v) => !v)}
            >
              <OverallPill
                text={mssText}
                tone={mssTone}
                title={mssSeverity.title}
                expandable
                expanded={mssExpanded}
              />
            </button>
          </Cell>
          <Cell label="ERR">
            <button
              type="button"
              className={styles.pillButton}
              aria-expanded={errExpanded}
              aria-label="Toggle module errors detail"
              onClick={() => setErrExpanded((v) => !v)}
            >
              <CountPill
                count={errCount}
                total={errTotal}
                text={errSeverity.text}
                tone={errTone}
                title={errSeverity.title}
                expandable
                expanded={errExpanded}
              />
            </button>
          </Cell>
        </div>
      </div>
      {mssExpanded && <DetailList items={mssItems} note={MSS_NOTE} />}
      {errExpanded && <DetailList items={errItems} note={ERR_NOTE} />}
    </div>
  )
}

const Cell: FC<{ label: string; children: ReactNode }> = ({
  label,
  children,
}) => (
  <div className={styles.cell}>
    <span className={styles.cellLabel}>{label}</span>
    {children}
  </div>
)

interface OverviewBoolCellProps {
  pvName: string
  data: Message<number | null> | undefined
  onText: string
  offText: string
  isConnected: boolean
}

// Local pill renderer for the overview row (CONN, FULLP): same tone rules as
// everything else, only the geometry is this bar's. Green when the bit is set,
// plain when it is not — see the note on `mssTone`.
const OverviewBoolCell: FC<OverviewBoolCellProps> = ({
  pvName,
  data,
  onText,
  offText,
  isConnected,
}) => {
  const isOn = data?.value === 1
  const { tone, text, title } = severityPresentation(data, {
    emphasis: isOn ? 'positive-important' : undefined,
    isConnected,
    pvName,
  })
  const label =
    text ?? (data?.value === 1 ? onText : data?.value === 0 ? offText : '<>')
  return (
    <span
      className={styles.pill}
      data-tone-surface="chip"
      data-tone={tone ?? (data ? undefined : 'unknown')}
      title={title}
    >
      {label}
    </span>
  )
}

const CountPill: FC<{
  count: number
  total: number
  /** Replaces the count entirely (e.g. the shared severity text). */
  text?: string
  /** Hover text (e.g. the invalid-severity detail). */
  title?: string
  /** Undefined = the neutral default. */
  tone?: Tone
  expandable?: boolean
  expanded?: boolean
}> = ({ count, total, text, tone, title, expandable, expanded }) => {
  return (
    <span
      className={styles.pill}
      data-tone-surface="chip"
      data-tone={tone}
      title={title}
    >
      <span className={styles.pillCount}>{text ?? `${count}/${total}`}</span>
      {expandable && (
        <span
          className={styles.cornerTriangle}
          data-expanded={expanded || undefined}
          aria-hidden
        />
      )}
    </span>
  )
}

// Overall boolean indicator (e.g. MSS): renders a single YES/NO/<> word, never
// a count. Spec: "MSS overall states must be shown as YES/NO, not numbers."
// Keeps the expand affordance so the per-indicator DetailList still opens.
const OverallPill: FC<{
  text: string
  /** Hover text (e.g. the invalid-severity detail). */
  title?: string
  /** Undefined = the neutral default. */
  tone?: Tone
  expandable?: boolean
  expanded?: boolean
}> = ({ text, tone, title, expandable, expanded }) => {
  return (
    <span
      className={styles.pill}
      data-tone-surface="chip"
      data-tone={tone}
      title={title}
    >
      <span className={styles.pillCount}>{text}</span>
      {expandable && (
        <span
          className={styles.cornerTriangle}
          data-expanded={expanded || undefined}
          aria-hidden
        />
      )}
    </span>
  )
}
