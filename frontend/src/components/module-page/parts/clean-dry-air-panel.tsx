import { FC } from 'react'

import { VolumePanel } from '@/components/hmi/volume-panel'

import type { CDAVolume, CleanDryAirConfig } from '@/lib/modules/types'

const DEFAULT_INNER_WIDTH = '9rem'
const DEFAULT_PRESSURE_HEIGHT = '22rem'

const Volume: FC<{ volume: CDAVolume }> = ({ volume }) => {
  return (
    <VolumePanel.Container width={volume.width ?? DEFAULT_INNER_WIDTH}>
      <VolumePanel.SensorBar
        title={volume.title}
        label={volume.pressure.label}
        height={DEFAULT_PRESSURE_HEIGHT}
        sensorPVs={[volume.pressure]}
      />
      <VolumePanel.SensorBar
        label={volume.flow.label}
        sensorPVs={[volume.flow]}
      />
    </VolumePanel.Container>
  )
}

/**
 * Clean Dry Air panel.
 * - 1 volume → single inner Container.
 * - 2+ volumes → wrapped in MultiVolumes.
 */
export const CleanDryAirPanel: FC<{ config: CleanDryAirConfig }> = ({
  config,
}) => {
  const isMulti = config.volumes.length > 1
  const width = config.width ?? (isMulti ? '100%' : undefined)

  return (
    <VolumePanel title={config.title} width={width}>
      {isMulti ? (
        <VolumePanel.MultiVolumes>
          {config.volumes.map((v) => (
            <Volume key={v.title} volume={v} />
          ))}
        </VolumePanel.MultiVolumes>
      ) : (
        config.volumes.map((v) => <Volume key={v.title} volume={v} />)
      )}
    </VolumePanel>
  )
}
