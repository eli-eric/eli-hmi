import { FC } from 'react'

import styles from './label-value.module.css'

interface Props {
  label: string
}

export const LabelValue: FC<Props> = ({ label }) => {
  return (
    <div className={styles.labelContainer}>
      <span>{label}</span>
    </div>
  )
}
