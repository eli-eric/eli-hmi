import { FC, ReactNode } from 'react'
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
  /** Tone driving the trailing status text colour. */
  state: DetailListItemState
  /** Optional text shown on the right. Falls back to a readable per-state
   * default so every row carries a text label, not just colour. */
  trailing?: string
}

interface DetailListProps {
  items: DetailListItem[]
  /** Optional compact footnote under the list (e.g. "selected, not
   * exhaustive"). Rendered in muted HMI styling. */
  note?: ReactNode
}

/** Readable fallback word per state, so a row is never colour-only. */
const DEFAULT_TRAILING: Record<DetailListItemState, string> = {
  ok: 'OK',
  err: 'ERR',
  run: 'RUN',
  sb: 'SB',
  stop: 'STOP',
  fail: 'FAIL',
  unknown: 'N/A',
}

/**
 * Expanded-detail list used by the four merged indicators in the wireframe:
 * MSS, Module Errors, Modbox State, and Flashlamps State. Each row carries a
 * single status indicator — a readable, colour-coded text label on the right —
 * so the operator never depends on colour alone.
 */
export const DetailList: FC<DetailListProps> = ({ items, note }) => {
  return (
    <>
      <ul className={styles.list}>
        {items.map((item, i) => (
          <li
            key={`${item.label}-${i}`}
            className={styles.item}
            data-state={item.state}
          >
            <span className={styles.label}>{item.label}</span>
            <span className={styles.trailing}>
              {item.trailing ?? DEFAULT_TRAILING[item.state]}
            </span>
          </li>
        ))}
      </ul>
      {note && <p className={styles.note}>{note}</p>}
    </>
  )
}
