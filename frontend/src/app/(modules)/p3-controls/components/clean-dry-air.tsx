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
        sensorPVs={[
          {
            pvName: 'E3-P3-PPS801:CDA_PRESSURE',
            label: 'PPS801',
            options: { format: 'precision' },
          },
        ]}
      />
    </VolumePanel>
  )
}
