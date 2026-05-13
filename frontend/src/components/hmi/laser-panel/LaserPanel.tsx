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
 * Compose section subcomponents as children:
 *   <LaserPanel title="NL2">
 *     <LaserPanel.General laser="NL2" mssCount={6} moduleErrors={...} />
 *     <LaserPanel.Regen laser="NL2" />
 *     <LaserPanel.Chillers laser="NL2" chillerIds={...} />
 *     <LaserPanel.Flashlamps laser="NL2" boxIds={...} delayPresets={...} />
 *     <LaserPanel.Modbox laser="NL2" modboxStateCount={5} />
 *   </LaserPanel>
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
