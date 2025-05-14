import { FC, PropsWithChildren } from 'react'
import styles from './line.module.css'

export const Line: FC<PropsWithChildren> = ({ children }) => {
  return <div className={styles.line}>{children}</div>
}
