import { FC, ReactNode } from 'react'
import styles from './DataRow.module.css'

interface DataRowProps {
  label: ReactNode
  value: ReactNode
  /** Optional trailing slot for a cog-button / write affordance. */
  action?: ReactNode
}

/**
 * Standard wireframe row: PV name on the left, value on the right, optional
 * cog-button at the far right. Two-column layout with the value column
 * left-aligned for tabular feel.
 */
export const DataRow: FC<DataRowProps> = ({ label, value, action }) => {
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{value}</span>
      {action ? <span className={styles.action}>{action}</span> : null}
    </div>
  )
}
