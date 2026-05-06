'use client'

import { FC, ReactNode } from 'react'

import { Heading } from '@/components/ui/heading'

import { BackingPanel } from './parts/backing-panel'
import { CleanDryAirPanel } from './parts/clean-dry-air-panel'
import { InterlocksPanel } from './parts/interlocks-panel'
import { RoughingPanel } from './parts/roughing-panel'

import type { ModuleConfig } from '@/lib/modules/types'

import styles from './module-control-page.module.css'

interface ModuleControlPageProps {
  config: ModuleConfig
  /**
   * The volumes-and-connectors ribbon on the lower right.
   * Module-specific JSX (volumes wired to bespoke PVs, connectors with cross-
   * module hrefs) — kept out of the config because the wiring is structural,
   * not data.
   */
  bottomRow: ReactNode
}

/**
 * Page shell for a single control module.
 *
 * Renders a config-driven top section (Interlocks + Safety Permission +
 * heading) and a bottom section (Clean Dry Air + Backing + Roughing on the
 * left, the caller-provided `bottomRow` on the right).
 */
export const ModuleControlPage: FC<ModuleControlPageProps> = ({
  config,
  bottomRow,
}) => {
  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <div className={styles.topContent}>
          <InterlocksPanel config={config.interlocks} />
          {/* Safety permissions render through the same panel — same shape, same UI. */}
          <InterlocksPanel config={config.safetyPermission} />
        </div>
        <Heading title={config.heading} />
      </div>
      <div className={styles.bottom}>
        <div className={styles.section}>
          <CleanDryAirPanel config={config.cleanDryAir} />
          <BackingPanel config={config.backing} />
          <RoughingPanel config={config.roughing} />
        </div>
        <div className={styles.bottomRow}>{bottomRow}</div>
      </div>
    </div>
  )
}
