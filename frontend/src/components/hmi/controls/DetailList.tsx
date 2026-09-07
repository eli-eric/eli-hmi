import { FC } from 'react'
import { UNKNOWN_TEXT, type Tone } from '@/lib/websocket/severity-presentation'
import styles from './DetailList.module.css'

export interface DetailListItem {
  /** Display label (e.g. "MSS 1", "REGEN", "22 Ch1"). */
  label: string
  /**
   * Tone for the status chip. Omit for the neutral default — which is what
   * almost every row wants: a state name is information, not an alarm, and
   * only the control system's own severity should colour it. Tones come from
   * `severityPresentation`; see the tone layer in `globals.css`.
   */
  tone?: Tone
  /** Status text. Falls back to `<>` when there is nothing to show. */
  text?: string
  /** Hover text for the status chip (e.g. the invalid-severity detail). */
  title?: string
}

interface DetailListProps {
  items: DetailListItem[]
  /** Optional explanatory note rendered inside the box, below the items
   * (e.g. the MSS "this is only a selection" note). Black, regular weight. */
  note?: string
}

/**
 * Expanded-detail list used by the merged indicators in the wireframe: MSS,
 * Module Errors, Modbox State, and Flashlamps State.
 *
 * Each row shows exactly one status chip: a text label (primary) tinted by
 * colour (secondary). There is no separate left rectangle / right dot.
 */
export const DetailList: FC<DetailListProps> = ({ items, note }) => {
  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={item.label} className={styles.item}>
          <span className={styles.label}>{item.label}</span>
          <span
            className={styles.status}
            data-tone-surface="chip"
            data-tone-chip="status"
            data-tone={item.tone}
            title={item.title}
          >
            {item.text ?? UNKNOWN_TEXT}
          </span>
        </li>
      ))}
      {note ? <li className={styles.note}>{note}</li> : null}
    </ul>
  )
}
