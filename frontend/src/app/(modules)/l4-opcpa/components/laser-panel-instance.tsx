'use client'

import { FC } from 'react'
import { LaserPanel } from '@/components/hmi/laser-panel'
import type { LaserSpec } from './laser-specs'

interface LaserPanelInstanceProps {
  spec: LaserSpec
}

export const LaserPanelInstance: FC<LaserPanelInstanceProps> = ({ spec }) => (
  <LaserPanel title={spec.laser}>
    <LaserPanel.General
      laser={spec.laser}
      mssCount={spec.mssCount}
      moduleErrors={spec.moduleErrors}
    />
    <LaserPanel.Regen laser={spec.laser} />
    <LaserPanel.Chillers laser={spec.laser} chillerIds={spec.chillerIds} />
    <LaserPanel.Flashlamps
      laser={spec.laser}
      boxIds={spec.boxIds}
      delayPresets={spec.delayPresets}
    />
    <LaserPanel.Modbox
      laser={spec.laser}
      modboxStateCount={spec.modboxStateCount}
    />
  </LaserPanel>
)
