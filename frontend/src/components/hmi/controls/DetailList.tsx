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
  /** Tone driving the per-item border + dot. */
  state: DetailListItemState
  /** Optional text shown on the right (e.g. the literal state string). */
  trailing?: string
}

interface DetailListProps {
  items: DetailListItem[]
}

/**
 * Expanded-detail list used by the four merged indicators in the wireframe:
 * MSS, Module Errors, Modbox State, and Flashlamps State. Each item has a
 * state tag that drives a left border + optional dot, so the operator can
 * spot the outliers at a glance.
 */
export const DetailList: FC<DetailListProps> = ({ items }) => {
  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li
          key={item.label}
          className={styles.item}
          data-state={item.state}
        >
          <span className={styles.label}>{item.label}</span>
          <span className={styles.trailing}>
            {item.trailing ?? <span className={styles.dot} aria-hidden />}
          </span>
        </li>
      ))}
    </ul>
  )
}
