import { VolumePanel } from '@/app/ws-components/volume-panel'

export const S1Volume = () => {
  return (
    <VolumePanel width="13rem">
      <VolumePanel.Title label="L3BT S1" />
      <VolumePanel.Container>
        <VolumePanel.Label label="L3BT S1 Volume" />
        <VolumePanel.StateControl />
        <VolumePanel.Card height="20rem">
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
      </VolumePanel.Container>
      <VolumePanel.Container>
        <VolumePanel.Label label="L3BT S1 Turbopump TMP511, CH501" />
        <VolumePanel.PumpSpeedConnected pvname="AI_TMP511" />
        <VolumePanel.Row>
          <VolumePanel.ValueUnitConnected pvname="AI_RPM_TMP511" />
          <VolumePanel.ValueUnitConnected pvname="AI_TEMP_TMP511" />
        </VolumePanel.Row>
      </VolumePanel.Container>
      <VolumePanel.Container>
        <VolumePanel.Label label="L3BT S1 Turbopump TMP512, CH503" />
        <VolumePanel.PumpSpeedConnected pvname="AI_TMP512" />
        <VolumePanel.Row>
          <VolumePanel.ValueUnitConnected pvname="AI_RPM_TMP512" />
          <VolumePanel.ValueUnitConnected pvname="AI_TEMP_TMP512" />
        </VolumePanel.Row>
      </VolumePanel.Container>
    </VolumePanel>
  )
}
