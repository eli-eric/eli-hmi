import { VolumePanel } from '@/components/ws-components/volume-panel'

/**
 * Clean Dry Air component for P3 controls
 * Displays clean dry air pressure information
 */
export const CleanDryAir = () => {
  return (
    <VolumePanel title="P3 Clean Dry Air (CDA)">
      <VolumePanel.Container>
        <VolumePanel.SensorBar
          title="P3 CDA Valve Actuation"
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
        <VolumePanel.SensorBar
          label="Flow"
          sensorPVs={[
            {
              pvName: 'E3-P3-PPS801:FLOW', //Add PV
              label: 'PPS801',
              options: { format: 'precision' },
            },
          ]}
        />
      </VolumePanel.Container>
    </VolumePanel>
  )
}
