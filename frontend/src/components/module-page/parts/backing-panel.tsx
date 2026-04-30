import { FC, ReactNode } from 'react'

import { VolumePanel } from '@/components/ws-components/volume-panel'

import type { BackingConfig } from '@/lib/modules/types'

/**
 * Backing panel: one sensor bar + one pump, optionally wrapped in an inner Container.
 */
export const BackingPanel: FC<{ config: BackingConfig }> = ({ config }) => {
  const inner: ReactNode = (
    <>
      <VolumePanel.SensorBar
        title={config.sensorBar.title}
        label={config.sensorBar.label}
        height={config.sensorBar.height}
        sensorPVs={config.sensorBar.sensorPVs}
      />
      <VolumePanel.Pump
        title={config.pump.title}
        rpmPV={config.pump.rpmPV}
        valvePv={config.pump.valvePv}
        valveLabel={config.pump.valveLabel}
      />
    </>
  )

  return (
    <VolumePanel title={config.title} width={config.width}>
      {config.containerWidth ? (
        <VolumePanel.Container width={config.containerWidth}>
          {inner}
        </VolumePanel.Container>
      ) : (
        inner
      )}
    </VolumePanel>
  )
}
