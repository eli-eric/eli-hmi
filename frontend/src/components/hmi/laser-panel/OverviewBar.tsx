'use client'

import { FC, ReactNode, useMemo, useRef, useState } from 'react'
import { useWebSocketData } from '@/lib/websocket/use-websocket-data'
import {
  DetailList,
  DetailListItem,
} from '@/components/hmi/controls/DetailList'
import type { LabeledPv } from '@/app/(modules)/l4-opcpa/config/schema'
import {
  severityTone,
  worstSeverityTone,
  type SeverityTone,
} from '@/lib/websocket/severity'
import { useCollapseOnAnyClick } from './use-collapse-on-any-click'
import { severityToDetailState } from './severity-detail-state'
import styles from './OverviewBar.module.css'

interface OverviewBarProps {
  connectionPv: string
  fullPowerPv: string
  /** MSS sub-indicators: display label + full PV name. */
  mss: readonly LabeledPv[]
  /** Module-error indicators: display label + full PV name. */
  moduleErrors: readonly LabeledPv[]
}

type Expanded = 'mss' | 'err' | null

const MSS_NOTE =
  'This is a selection of some MSS indicators, it is NOT an exhaustive list of all parameters that lead to the overall MSS indicator.'

const ERR_NOTE = 
  'Error code 0 means no error.'

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
  const [expanded, setExpanded] = useState<Expanded>(null)
  const triggerRef = useRef<HTMLDivElement | null>(null)
  useCollapseOnAnyClick(
    expanded !== null,
    () => setExpanded(null),
    triggerRef,
  )

  const mssPvs = useMemo(() => mss.map((m) => m.pv), [mss])
  const moduleErrorPvs = useMemo(
    () => moduleErrors.map((m) => m.pv),
    [moduleErrors],
  )
  const boolPvs = useMemo(
    () => [connectionPv, fullPowerPv, ...mssPvs],
    [connectionPv, fullPowerPv, mssPvs],
  )
  const { state } = useWebSocketData<number | null>({ pvs: boolPvs, raw: true })
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
  const mssSeverity = worstSeverityTone(
    mss.map(({ pv: name }) => severityTone(state[name])),
  )
  const mssOk = mss.filter(
    ({ pv: name }) => state[name]?.ok && state[name]?.value === 1,
  ).length

  const errTotal = moduleErrors.length
  const errSeverity = worstSeverityTone(
    moduleErrors.map(({ pv: name }) => severityTone(errState[name])),
  )
  const errUnknown = moduleErrors.filter(
    ({ pv: name }) => severityTone(errState[name]) === 'unknown',
  ).length
  const errOk = moduleErrors.filter(
    ({ pv: name }) => errState[name]?.ok && errState[name]?.value === '0000',
  ).length
  const errCount = errTotal - errOk - errUnknown

  // Neither list colours by its own value (e.g. "is the bit 1" / "is the code
  // 0000") — style comes only from EPICS severity: 'unknown' (no data yet),
  // 'neutral' (data present, severity none — no style change), or a
  // warning/error/invalid override. The raw value is still shown as text.
  const mssItems: DetailListItem[] = mss.map(({ label, pv: name }) => {
    const msg = state[name]
    const sev = severityTone(msg)
    if (sev !== 'none') {
      return { label, state: severityToDetailState(sev) }
    }
    return {
      label,
      state: 'neutral',
      trailing: msg!.value != null ? String(msg!.value) : undefined,
    }
  })

  const errItems: DetailListItem[] = moduleErrors.map(({ label, pv: name }) => {
    const msg = errState[name]
    const sev = severityTone(msg)
    if (sev !== 'none') {
      return { label, state: severityToDetailState(sev) }
    }
    return { label, state: 'neutral', trailing: msg!.value ?? undefined }
  })

  // Maps an aggregate severity onto this file's pill tone vocabulary. 'error'
  // reuses 'negative-important' (already the severe-red tone here) rather
  // than adding a redundant fourth red variant.
  const severityPillTone = (
    sev: Exclude<SeverityTone, 'none'>,
  ): 'negative-important' | 'warning' | 'invalid' | 'unknown' =>
    sev === 'error' ? 'negative-important' : sev

  const mssTone =
    mssSeverity === 'none'
      ? mssOk === mssTotal
        ? 'positive-important'
        : 'negative-important'
      : severityPillTone(mssSeverity)
  const mssText =
    mssSeverity === 'unknown'
      ? '<>'
      : mssSeverity !== 'none'
        ? 'NO'
        : mssOk === mssTotal
          ? 'YES'
          : 'NO'

  const errTone =
    errSeverity === 'none'
      ? errCount === 0
        ? 'positive-neutral'
        : 'negative-important'
      : severityPillTone(errSeverity)

  const toggle = (cell: Expanded) =>
    setExpanded((prev) => (prev === cell ? null : cell))

  return (
    <div className={styles.wrapper}>
      <div className={styles.row}>
        <span className={styles.rowLabel}>Overview</span>
        <div className={styles.grid} ref={triggerRef}>
          <Cell label="CONN">
            <OverviewBoolCell value={connMsg?.value} onText="YES" offText="NO" />
          </Cell>
          <Cell label="FULLP">
            <OverviewBoolCell
              value={fullpMsg?.value}
              onText="YES"
              offText="NO"
              offTone="negative-neutral"
            />
          </Cell>
          <Cell label="MSS">
            <button
              type="button"
              className={styles.pillButton}
              aria-expanded={expanded === 'mss'}
              aria-label="Toggle MSS detail"
              onClick={() => toggle('mss')}
            >
              <OverallPill
                text={mssText}
                tone={mssTone}
                expandable
                expanded={expanded === 'mss'}
              />
            </button>
          </Cell>
          <Cell label="ERR">
            <button
              type="button"
              className={styles.pillButton}
              aria-expanded={expanded === 'err'}
              aria-label="Toggle module errors detail"
              onClick={() => toggle('err')}
            >
              <CountPill
                count={errCount}
                total={errTotal}
                tone={errTone}
                expandable
                expanded={expanded === 'err'}
              />
            </button>
          </Cell>
        </div>
      </div>
      {expanded === 'mss' && (
        <DetailList items={mssItems} note={MSS_NOTE} />
      )}
      {expanded === 'err' && (
        <DetailList items={errItems} note={ERR_NOTE} />
      )}
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
  value: unknown
  onText: string
  offText: string
  /** Tone applied when value=0. Defaults to 'negative-important' (red).
   * Use 'negative-neutral' for OFF states that aren't actually errors
   * (e.g. FULLP=0 just means "not at full power"). */
  offTone?: 'negative-important' | 'negative-neutral'
}

// Local pill renderer for the overview row (CONN, FULLP). Distinct from
// `BoolPill` in controls/Values.tsx, which is PV-subscribing.
const OverviewBoolCell: FC<OverviewBoolCellProps> = ({
  value,
  onText,
  offText,
  offTone = 'negative-important',
}) => {
  if (value === 1) {
    return (
      <span className={styles.pill} data-tone="positive-important">
        {onText}
      </span>
    )
  }
  if (value === 0) {
    return (
      <span className={styles.pill} data-tone={offTone}>
        {offText}
      </span>
    )
  }
  return (
    <span className={styles.pill} data-tone="unknown">
      &lt;&gt;
    </span>
  )
}

const CountPill: FC<{
  count: number
  total: number
  tone:
    | 'positive-important'
    | 'positive-neutral'
    | 'negative-important'
    | 'unknown'
    | 'warning'
    | 'invalid'
  expandable?: boolean
  expanded?: boolean
}> = ({ count, total, tone, expandable, expanded }) => {
  return (
    <span className={styles.pill} data-tone={tone}>
      <span className={styles.pillCount}>
        {count}/{total}
      </span>
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
  tone:
    | 'positive-important'
    | 'positive-neutral'
    | 'negative-important'
    | 'unknown'
    | 'warning'
    | 'invalid'
  expandable?: boolean
  expanded?: boolean
}> = ({ text, tone, expandable, expanded }) => {
  return (
    <span className={styles.pill} data-tone={tone}>
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
