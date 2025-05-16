import { VolumePanel } from '@/app/ws-components/volume-panel'

const P3Chamber = () => {
  return (
    <VolumePanel.Container width="100%">
      <VolumePanel.Label label="P3 Chamber" />
      <VolumePanel.StateControl />
      <VolumePanel.Card title="Pressure">
        <VolumePanel.SensorPressureConnected
          label="WRG801"
          pvname="AI_MBAR_WRG801"
        />
        <VolumePanel.SensorPressureConnected
          label="WRG802"
          pvname="AI_MBAR_WRG802"
        />
        <VolumePanel.SensorPressureConnected
          label="WRG803"
          pvname="AI_MBAR_WRG803"
        />
      </VolumePanel.Card>
      <VolumePanel.Card title="Total Pump Cycles"></VolumePanel.Card>
    </VolumePanel.Container>
  )
}

export const P3Volumes = () => {
  return (
    <VolumePanel>
      <VolumePanel.Title label="P3" />
      <VolumePanel.MultiVolumes>
        <P3Chamber />
      </VolumePanel.MultiVolumes>
    </VolumePanel>
  )
}
