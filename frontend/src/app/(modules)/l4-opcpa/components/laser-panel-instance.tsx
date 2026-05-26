'use client'

import { FC } from 'react'
import { LaserPanel } from '@/components/hmi/laser-panel'
import type { LaserSpec } from '../config/schema'

interface LaserPanelInstanceProps {
  spec: LaserSpec
}

/**
 * Renders one laser column from a {@link LaserSpec}. Sections whose device bank
 * is empty are omitted: no chillers → no Chillers section, `modboxStateCount: 0`
 * → no Modbox, no flashlamp boxes → no Flashlamps. General + Regen always show.
 * `commands` gates which action buttons each section renders.
 */
export const LaserPanelInstance: FC<LaserPanelInstanceProps> = ({ spec }) => (
  <LaserPanel title={spec.laser}>
    <LaserPanel.General
      laser={spec.laser}
      mssCount={spec.mssCount}
      moduleErrors={spec.moduleErrors}
      commands={spec.commands}
    />
    <LaserPanel.Regen laser={spec.laser} />
    {spec.chillerIds.length > 0 && (
      <LaserPanel.Chillers laser={spec.laser} chillerIds={spec.chillerIds} />
    )}
    {spec.boxIds.length > 0 && (
      <LaserPanel.Flashlamps
        laser={spec.laser}
        boxIds={spec.boxIds}
        channelsPerBox={spec.channelsPerBox}
        delayPresets={spec.delayPresets}
        commands={spec.commands}
      />
    )}
    {spec.modboxStateCount > 0 && (
      <LaserPanel.Modbox
        laser={spec.laser}
        modboxStateCount={spec.modboxStateCount}
        commands={spec.commands}
      />
    )}
  </LaserPanel>
)
