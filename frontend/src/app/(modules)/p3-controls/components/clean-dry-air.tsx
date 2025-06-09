import { VolumePanel } from '@/components/ws-components/volume-panel'

/**
 * Clean Dry Air component for P3 controls
 * Displays clean dry air pressure information
 */
export const ClearDryAir = () => {
  return (
    <VolumePanel title="P3 Clean Dry Air">
      <VolumePanel.SensorBar
        title="P3 Clean Dry Air"
        label="Pressure"
        height="22rem"
        sensorPVs={[{ pvName: 'AI_BAR_PPS801', label: 'PPS801' }]}
      />
    </VolumePanel>
  )
}
