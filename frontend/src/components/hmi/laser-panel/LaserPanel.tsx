'use client'

import { FC, PropsWithChildren } from 'react'
import { GeneralSection } from './GeneralSection'
import { RegenSection } from './RegenSection'
import { ChillersSection } from './ChillersSection'
import { FlashlampsSection } from './FlashlampsSection'
import { ModboxSection } from './ModboxSection'
import styles from './LaserPanel.module.css'

interface LaserPanelProps {
  title: string
}

/**
 * LaserPanel - compound shell for one laser's column on the L4 OPCPA page.
 *
 * Composed via `laser-panel-instance.tsx`, which unpacks a `LaserSpec` resolved
 * from `config/lasers.yaml`. Sections receive full PV-name strings as props
 * (e.g. `shutterPv`, `chillers`, `flashlamps`); only command PVs are built in
 * code. `laser` is passed only where command PVs are needed.
 */
export const LaserPanel: FC<PropsWithChildren<LaserPanelProps>> & {
  General: typeof GeneralSection
  Regen: typeof RegenSection
  Chillers: typeof ChillersSection
  Flashlamps: typeof FlashlampsSection
  Modbox: typeof ModboxSection
} = ({ title, children }) => {
  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
      </header>
      <div className={styles.body}>{children}</div>
    </div>
  )
}

LaserPanel.General = GeneralSection
LaserPanel.Regen = RegenSection
LaserPanel.Chillers = ChillersSection
LaserPanel.Flashlamps = FlashlampsSection
LaserPanel.Modbox = ModboxSection
