import { FC } from 'react'

import { VolumePanel } from '@/components/ws-components/volume-panel'

import type { InterlockGroupConfig } from '@/lib/modules/types'

/**
 * Renders a group of interlocks driven by a config object.
 * Used for both the Interlocks and Machine-Safety-Permission panels.
 */
export const InterlocksPanel: FC<{ config: InterlockGroupConfig }> = ({
  config,
}) => {
  return (
    <VolumePanel
      width={config.width ?? '16rem'}
      title={config.title}
      checkClearPv={config.checkClearPv}
    >
      <VolumePanel.Interlocks interlocksPVs={config.items} />
    </VolumePanel>
  )
}
