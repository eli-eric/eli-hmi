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
    <VolumePanel>
      <VolumePanel.Title label="L3BT Clean Dry Air" />
      <VolumePanel.Card height="22rem">
        <VolumePanel.CardLabel>Pressure</VolumePanel.CardLabel>
        <VolumePanel.SensorPressureConnected
          pvname={PV_SETTINGS[ENV].pressurePV}
          label="PPS511"
          onDataUpdate={(msg) => {
            console.log('Clean Dry Air Data Update', msg)
          }}
        />
      </VolumePanel.Card>
    </VolumePanel>
  )
}
