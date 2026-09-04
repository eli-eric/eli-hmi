import { FC } from 'react'
import {
  INVALID_TEXT,
  UNKNOWN_TEXT,
} from '@/lib/websocket/severity-presentation'
import styles from './DetailList.module.css'

/**
 * Allowed `state` tokens. These map 1:1 to `data-state="…"` selectors in
 * DetailList.module.css. Anything outside this union has no styling.
 */
export type DetailListItemState =
  | 'ok'
  | 'err'
  | 'run'
  | 'sb'
  | 'stop'
  | 'fail'
  | 'unknown'
  /** Valid data with no dedicated tone/colour yet — renders with the plain
   * base style (no `[data-state]` CSS rule), distinct from `unknown` (which
   * is reserved for missing/invalid data). */
  | 'neutral'
  /** EPICS severity MINOR (1). */
  | 'warning'
  /** EPICS severity INVALID (3), or the PV is disconnected/errored
   * (`ok: false`) — distinct from `unknown` (no data has arrived yet). */
  | 'invalid'

export interface DetailListItem {
  /** Display label (e.g. "MSS 1", "REGEN", "22 Ch1"). */
  label: string
  /** Tone driving the single status indicator. */
  state: DetailListItemState
  /** Optional explicit status text. When omitted, a default is derived from
   * `state` so every row always shows a text label. */
  trailing?: string
  /** Hover text for the status indicator (e.g. the invalid-severity detail). */
  title?: string
}

interface DetailListProps {
  items: DetailListItem[]
  /** Optional explanatory note rendered inside the box, below the items
   * (e.g. the MSS "this is only a selection" note). Black, regular weight. */
  note?: string
}

/** Default status text per state, so every indicator carries a text label
 * (text primary, colour secondary). */
const STATE_TEXT: Record<DetailListItemState, string> = {
  ok: 'OK',
  err: 'ERR',
  run: 'RUN',
  sb: 'SB',
  stop: 'STOP',
  fail: 'FAIL',
  unknown: UNKNOWN_TEXT,
  neutral: '',
  warning: 'WARN',
  // Fallback only — severity call sites pass the shared table's text, which
  // distinguishes 'PV INV' from 'PV DSC'.
  invalid: INVALID_TEXT,
}

/**
 * Expanded-detail list used by the merged indicators in the wireframe: MSS,
 * Module Errors, Modbox State, and Flashlamps State.
 *
 * Each row shows exactly one status indicator: a text label (primary) tinted
 * by colour (secondary). There is no separate left rectangle / right dot.
 */
export const DetailList: FC<DetailListProps> = ({ items, note }) => {
  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={item.label} className={styles.item}>
          <span className={styles.label}>{item.label}</span>
          <span
            className={styles.status}
            data-state={item.state}
            title={item.title}
          >
            {item.trailing ?? STATE_TEXT[item.state]}
          </span>
        </li>
      ))}
      {note ? <li className={styles.note}>{note}</li> : null}
    </ul>
  )
}
