import { FC, PropsWithChildren } from 'react'
import styles from './SectionCard.module.css'

interface SectionCardProps {
  title?: string
}

export const SectionCard: FC<PropsWithChildren<SectionCardProps>> = ({
  title,
  children,
}) => {
  return (
    <section className={styles.card}>
      {title && <h3 className={styles.title}>{title}</h3>}
      <div className={styles.body}>{children}</div>
    </section>
  )
}
