import { FC, PropsWithChildren } from 'react'
import styles from './TextContent.module.css'

export const TextContent: FC<PropsWithChildren> = ({ children }) => {
  return <div className={styles.textContent}>{children}</div>
}
