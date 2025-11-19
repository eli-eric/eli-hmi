import { VolumePanel } from '@/components/ws-components/volume-panel'

/**
 * Clean Dry Air component for L3BT controls
 * Displays clean dry air pressure information
 */

export const CleanDryAir = () => {
  return (
    <VolumePanel title="L3BT Clean Dry Air (CDA)" width="100%">
      <VolumePanel.MultiVolumes>
        <ValveActuation />
        <Venting />
      </VolumePanel.MultiVolumes>
    </VolumePanel>
  )
}

export const ValveActuation = () => {
  return (
    <VolumePanel.Container width="9rem">
      <VolumePanel.SensorBar
        title="L3BT CDA Valve Actuation"
        label="Pressure"
        height="22rem"
        sensorPVs={[{ pvName: 'L3BT-VCS-PPS511:PRESSURE', label: 'PPS511' }]}
      />
      <VolumePanel.SensorBar
        label="Flow"
        sensorPVs={[
          {
            pvName: 'E3-P3-PPS511:FLOW', //Add PV
            label: 'PPFS511',
            options: { format: 'precision' },
          },
        ]}
      />
    </VolumePanel.Container>
  )
}

export const Venting = () => {
  return (
    <VolumePanel.Container width="9rem">
      <VolumePanel.SensorBar
        title="L3BT CDA Venting"
        label="Pressure"
        height="22rem"
        sensorPVs={[{ pvName: 'L3BT-VCS-PPS511:PRESSURE', label: 'PPS511' }]}
      />
      <VolumePanel.SensorBar
        label="Flow"
        sensorPVs={[
          {
            pvName: 'E3-P3-PPS512:FLOW', //Add PV
            label: 'PPFS512',
            options: { format: 'precision' },
          },
        ]}
      />
    </VolumePanel.Container>
  )
}
