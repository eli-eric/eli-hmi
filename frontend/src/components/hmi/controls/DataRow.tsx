import { FC, ReactNode } from 'react'
import styles from './DataRow.module.css'

interface DataRowProps {
  label: ReactNode
  value: ReactNode
  /** Optional trailing slot for a cog-button / write affordance. */
  action?: ReactNode
  /**
   * Visual variant of the value cell.
   * - 'boxed' (default): standard bordered cell.
   * - 'bare': transparent, no border/padding — for inline pills/buttons that
   *   carry their own chrome.
   */
  valueVariant?: 'boxed' | 'bare'
}

/**
 * Standard wireframe row: PV name on the left, value on the right, optional
 * cog-button at the far right. Two-column layout with the value column
 * left-aligned for tabular feel.
 */
export const DataRow: FC<DataRowProps> = ({
  label,
  value,
  action,
  valueVariant = 'boxed',
}) => {
  const valueClass =
    valueVariant === 'bare' ? `${styles.value} ${styles.valueBare}` : styles.value
  return (
    <div className={styles.row} data-has-action={action ? 'true' : 'false'}>
      <span className={styles.label}>{label}</span>
      <span className={valueClass}>{value}</span>
      {action ? <span className={styles.action}>{action}</span> : null}
    </div>
  )
}
