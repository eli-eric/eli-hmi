import { FC } from 'react'
import styles from '../styles/label-value.module.css'

interface LabelValueProps {
  label: string
}

/**
 * LabelValue component for ConnectorLine
 *
 * Displays a label in the connector line
 */
export const LabelValue: FC<LabelValueProps> = ({ label }) => {
  return (
    <div className={styles.labelValue}>
      <span>{label}</span>
    </div>
  )
}
