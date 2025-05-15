import { VolumePanel } from '@/app/ws-components/volume-panel'

export const S1Volume = () => {
  return (
    <VolumePanel width="12.5rem">
      <VolumePanel.Title label="L3BT S1" />
      <VolumePanel.PumpContainer>
        <VolumePanel.Label label="L3BT S1 Volume" />
        <VolumePanel.StateControl />
        <VolumePanel.Card>
          <VolumePanel.CardLabel>Pressure</VolumePanel.CardLabel>
          <VolumePanel.SensorPressureConnected
            pvname="AI_MBAR_WRG511"
            label="WRG511 CH010"
          />
          <VolumePanel.SensorPressureConnected
            pvname="AI_MBAR_WRG512"
            label="WRG512 CH030"
          />
          <VolumePanel.SensorPressureConnected
            pvname="AI_MBAR_WRG513"
            label="WRG513 CH010"
          />
        </VolumePanel.Card>
      </VolumePanel.PumpContainer>
    </VolumePanel>
  )
}
