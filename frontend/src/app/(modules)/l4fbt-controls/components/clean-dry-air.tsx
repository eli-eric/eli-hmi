import { VolumePanel } from '@/components/ws-components/volume-panel'

/**
 * Clean Dry Air component for L4fBT controls
 * Displays clean dry air pressure information
 */
export const CDAValveActuation = () => {
  return (
    <VolumePanel.Container width="9rem">
      <VolumePanel.SensorBar
        title="L4fBT CDA Valve Actuation"
        label="Pressure"
        height="22rem"
        sensorPVs={[
          {
            pvName: 'undefined1:CDA_PRESSURE', //Add PV
            label: 'PPS583',
            options: { format: 'precision' },
          },
        ]}
      />
      <VolumePanel.SensorBar
        label="Flow"
        height="5rem"
        sensorPVs={[
          {
            pvName: 'undefined2:PRESSURE', //Add PV + change to Flow
            label: 'PFS583',
            options: { format: 'precision' },
          },
        ]}
      />
    </VolumePanel.Container>
  )
}

export const CDAVenting = () => {
  return (
    <VolumePanel.Container width="9rem">
      <VolumePanel.SensorBar
        title="L4fBT CDA Venting"
        label="Pressure"
        height="22rem"
        sensorPVs={[
          {
            pvName: 'undefined3:CDA_PRESSURE', //Add PV
            label: 'PPS584',
            options: { format: 'precision' },
          },
        ]}
      />
      <VolumePanel.SensorBar
        label="Flow"
        height="5rem"
        sensorPVs={[
          {
            pvName: 'undefined4:PRESSURE', //Add PV + change to Flow
            label: 'PFS584',
            options: { format: 'precision' },
          },
        ]}
      />
    </VolumePanel.Container>
  )
}

export const CleanDryAir = () => {
  return (
    <VolumePanel title="L4fBT Clean Dry Air (CDA)" width="100%">
      <VolumePanel.MultiVolumes>
        <CDAValveActuation />
        <CDAVenting />
      </VolumePanel.MultiVolumes>
    </VolumePanel>
  )
}
