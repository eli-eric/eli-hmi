import { FC, ReactNode } from 'react'

import { VolumePanel } from '@/components/hmi/volume-panel'

import type { RoughingConfig } from '@/lib/modules/types'

/**
 * Roughing panel: sensor bar + pump + optional Locking row, optionally wrapped
 * in an inner Container.
 */
export const RoughingPanel: FC<{ config: RoughingConfig }> = ({ config }) => {
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
      {config.locking && (
        <VolumePanel.Locking
          label={config.locking.label}
          pvName={config.locking.pvName}
        />
      )}
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
