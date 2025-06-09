import { VolumePanel } from '@/components/ws-components/volume-panel'

export const S3Volume = () => {
  return (
    <VolumePanel width="13rem">
      <VolumePanel.Title label="L3BT S3" />
      <VolumePanel.Container>
        <VolumePanel.Label label="L3BT S3 Volume" />
        <VolumePanel.StateControl />
        <VolumePanel.Card height="20rem">
          <VolumePanel.CardLabel>Pressure</VolumePanel.CardLabel>
          <VolumePanel.SensorPressureConnected
            pvname="AI_MBAR_WRG531"
            label="WRG531 CH055"
          />
          <VolumePanel.SensorPressureConnected
            pvname="AI_MBAR_WRG532"
            label="WRG532 CH040"
          />
          <VolumePanel.SensorPressureConnected
            pvname="AI_MBAR_WRG533"
            label="APG533 CH055"
          />
        </VolumePanel.Card>
      </VolumePanel.Container>
      <VolumePanel.TurbopumpBasic
        label="L3BT S1 Turbopump TMP532, Pipe"
        statusPV="AI_TMP532"
        rpmPV="AI_RPM_TMP532"
        tempPV="AI_TEMP_TMP532"
      />
      <VolumePanel.TurbopumpBasic
        label="L3BT S1 Turbopump TMP531, CH504"
        statusPV="AI_TMP531"
        rpmPV="AI_RPM_TMP531"
        tempPV="AI_TEMP_TMP531"
      />
    </VolumePanel>
  )
}
