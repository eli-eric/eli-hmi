import { FC } from 'react'
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

export interface DetailListItem {
  /** Display label (e.g. "MSS 1", "REGEN", "22 Ch1"). */
  label: string
  /** Tone driving the single status indicator. */
  state: DetailListItemState
  /** Optional explicit status text. When omitted, a default is derived from
   * `state` so every row always shows a text label. */
  trailing?: string
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
  unknown: '<>',
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
          <span className={styles.status} data-state={item.state}>
            {item.trailing ?? STATE_TEXT[item.state]}
          </span>
        </li>
      ))}
      {note ? (
        <li className={styles.note}>{note}</li>
      ) : null}
    </ul>
  )
}
