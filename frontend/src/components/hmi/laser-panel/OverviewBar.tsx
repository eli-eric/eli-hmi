'use client'

import { FC, ReactNode, useMemo, useRef, useState } from 'react'
import { useWebSocketData } from '@/lib/websocket/use-websocket-data'
import {
  DetailList,
  DetailListItem,
} from '@/components/hmi/controls/DetailList'
import type { LabeledPv } from '@/app/(modules)/l4-opcpa/config/schema'
import { useCollapseOnAnyClick } from './use-collapse-on-any-click'
import styles from './OverviewBar.module.css'

interface OverviewBarProps {
  connectionPv: string
  fullPowerPv: string
  mssPvs: readonly string[]
  /** Module-error indicators: display label + full PV name. */
  moduleErrors: readonly LabeledPv[]
}

type Expanded = 'mss' | 'err' | null

const MSS_NOTE =
  'This is a selection of some MSS indicators, it is NOT an exhaustive list of all parameters that lead to the overall MSS indicator.'

/**
 * Four-cell header cluster at the top of the General box per the Confluence
 * wireframe: CONN, FULLP, MSS, ERR. MSS and ERR are clickable to expand a
 * per-item detail list (matches Description: "Through a click it can be
 * expanded in a list showing all individual MSS boolean indicators").
 */
export const OverviewBar: FC<OverviewBarProps> = ({
  connectionPv,
  fullPowerPv,
  mssPvs,
  moduleErrors,
}) => {
  const [expanded, setExpanded] = useState<Expanded>(null)
  const triggerRef = useRef<HTMLDivElement | null>(null)
  useCollapseOnAnyClick(
    expanded !== null,
    () => setExpanded(null),
    triggerRef,
  )

  const moduleErrorPvs = useMemo(
    () => moduleErrors.map((m) => m.pv),
    [moduleErrors],
  )
  const allPvs = useMemo(
    () => [connectionPv, fullPowerPv, ...mssPvs, ...moduleErrorPvs],
    [connectionPv, fullPowerPv, mssPvs, moduleErrorPvs],
  )
  const { state } = useWebSocketData<number | null>({ pvs: allPvs, raw: true })

  const connMsg = state[connectionPv]
  const fullpMsg = state[fullPowerPv]

  // "unknown" = no message received yet OR `ok=false`. We deliberately count
  // unknown separately from error so first-paint (before any WS message)
  // shows `<>` / unknown tone, not red "total/total error".
  const mssTotal = mssPvs.length
  const mssUnknown = mssPvs.filter((name) => {
    const m = state[name]
    return !m || !m.ok
  }).length
  const mssOk = mssPvs.filter(
    (name) => state[name]?.ok && state[name]?.value === 1,
  ).length

  const errTotal = moduleErrorPvs.length
  const errUnknown = moduleErrorPvs.filter((name) => {
    const m = state[name]
    return !m || !m.ok
  }).length
  const errOk = moduleErrorPvs.filter(
    (name) => state[name]?.ok && state[name]?.value === 0,
  ).length
  const errCount = errTotal - errOk - errUnknown

  const mssItems: DetailListItem[] = mssPvs.map((name, i) => {
    const msg = state[name]
    return {
      label: `MSS ${i + 1}`,
      state:
        !msg || !msg.ok ? 'unknown' : msg.value === 1 ? 'ok' : 'err',
    }
  })

  const errItems: DetailListItem[] = moduleErrors.map(({ label, pv: name }) => {
    const msg = state[name]
    return {
      label,
      state:
        !msg || !msg.ok ? 'unknown' : msg.value === 0 ? 'ok' : 'err',
    }
  })

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
                text={
                  mssTotal === 0 || mssUnknown === mssTotal
                    ? '<>'
                    : mssOk === mssTotal
                      ? 'YES'
                      : 'NO'
                }
                tone={
                  mssTotal === 0 || mssUnknown === mssTotal
                    ? 'unknown'
                    : mssOk === mssTotal
                      ? 'positive-important'
                      : 'negative-important'
                }
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
                tone={
                  errTotal === 0 || errUnknown === errTotal
                    ? 'unknown'
                    : errCount === 0
                      ? 'positive-neutral'
                      : 'negative-important'
                }
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
      {expanded === 'err' && <DetailList items={errItems} />}
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
