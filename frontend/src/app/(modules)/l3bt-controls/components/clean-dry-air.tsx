import { VolumePanel } from '@/components/ws-components/volume-panel'
import { ENV } from '@/types/constants'

/**
 * Clean Dry Air component for L3BT controls
 * Displays clean dry air pressure information
 */

const PV_SETTINGS = {
  development: {
    pressurePV: 'AI_BAR_L3BT-VCS-PPS511:PRESSURE',
  },
  production: {
    pressurePV: 'L3BT-VCS-PPS511:PRESSURE',
  },
  test: {
    pressurePV: 'AI_BAR_L3BT-VCS-PPS511:PRESSURE',
  },
}

export const ClearDryAir = () => {
  return (
    <VolumePanel title="L3BT Clean Dry Air" width="9rem">
      <VolumePanel.SensorBar
        label="Pressure"
        height="22rem"
        sensorPVs={[{ pvName: PV_SETTINGS[ENV].pressurePV, label: 'PPS511' }]}
      />
    </VolumePanel>
  )
}
