import { VolumePanel } from '@/components/ws-components/volume-panel'

/**
 * Clean Dry Air component for L3BT controls
 * Displays clean dry air pressure information
 */

export const CleanDryAir = () => {
  return (
    <VolumePanel title="L3BT Clean Dry Air" width="9rem">
      <VolumePanel.SensorBar
        label="Pressure"
        height="22rem"
        sensorPVs={[{ pvName: 'L3BT-VCS-PPS511:PRESSURE', label: 'PPS511' }]}
      />
    </VolumePanel>
  )
}
