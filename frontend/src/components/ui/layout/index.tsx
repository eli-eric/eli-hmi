import { FC, PropsWithChildren } from 'react'
import styles from './layout.module.css'

const PageLayout: FC<PropsWithChildren> = ({ children }) => {
  return <div className={styles.layout}>{children}</div>
}

const TopContainer: FC<PropsWithChildren> = ({ children }) => {
  return <div className={styles.topContainer}>{children}</div>
}

const TopContentContainer: FC<PropsWithChildren> = ({ children }) => {
  return <div className={styles.topContentContainer}>{children}</div>
}

const BottomContainer: FC<PropsWithChildren> = ({ children }) => {
  return <div className={styles.bottomContainer}>{children}</div>
}

export { PageLayout, TopContainer, BottomContainer, TopContentContainer }
