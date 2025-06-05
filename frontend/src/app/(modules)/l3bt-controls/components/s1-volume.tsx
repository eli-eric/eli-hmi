import { VolumePanel } from '@/components/ws-components/volume-panel'
import { ENV } from '@/types/constants'

/**
 * S1Volume component
 *
 * Displays the L3BT S1 volume panel with pressure readings and turbopump information
 */

const PV_SETTINGS = {
  development: {
    pressureWRG511: 'AI_MBAR_L3BT-VCS-WRG511:PRESSURE',
    pressureWRG512: 'AI_MBAR_L3BT-VCS-WRG512:PRESSURE',
    pressureWRG513: 'AI_MBAR_L3BT-VCS-APG513:PRESSURE',
    pumpTMP511: 'AI_L3BT-VCS-TMP511:ActualFrequency', // TODO
    pumpTMP512: 'AI_L3BT-VCS-TMP512:ActualFrequency', // TODO
    rpmTMP511: 'AI_RPM_L3BT-VCS-TMP511:ActualFrequency',
    rpmTMP512: 'AI_RPM_L3BT-VCS-TMP512:ActualFrequency',
    tempTMP511: 'AI_TEMP_L3BT-VCS-TMP511:ActualConverterTemperature',
    tempTMP512: 'AI_TEMP_L3BT-VCS-TMP512:ActualConverterTemperature',
  },
  production: {
    pressureWRG511: 'L3BT-VCS-WRG511:PRESSURE',
    pressureWRG512: 'L3BT-VCS-WRG512:PRESSURE',
    pressureWRG513: 'L3BT-VCS-APG513:PRESSURE',
    pumpTMP511: 'L3BT-VCS-TMP511:ActualFrequency', //TODO
    pumpTMP512: 'L3BT-VCS-TMP512:ActualFrequency', //TODO
    rpmTMP511: 'L3BT-VCS-TMP511:ActualFrequency',
    rpmTMP512: 'L3BT-VCS-TMP512:ActualFrequency',
    tempTMP511: 'L3BT-VCS-TMP511:ActualConverterTemperature',
    tempTMP512: 'L3BT-VCS-TMP512:ActualConverterTemperature',
  },
  test: {
    pressureWRG511: 'AI_MBAR_L3BT-VCS-WRG511:PRESSURE',
    pressureWRG512: 'AI_MBAR_L3BT-VCS-WRG512:PRESSURE',
    pressureWRG513: 'AI_MBAR_L3BT-VCS-APG513:PRESSURE',
    pumpTMP511: 'AI_L3BT-VCS-TMP511:ActualFrequency', //TODO
    pumpTMP512: 'AI_L3BT-VCS-TMP512:ActualFrequency', //TODO
    rpmTMP511: 'AI_RPM_L3BT-VCS-TMP511:ActualFrequency',
    rpmTMP512: 'AI_RPM_L3BT-VCS-TMP512:ActualFrequency',
    tempTMP511: 'AI_TEMP_L3BT-VCS-TMP511:ActualConverterTemperature',
    tempTMP512: 'AI_TEMP_L3BT-VCS-TMP512:ActualConverterTemperature',
  },
}

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
            pvname={PV_SETTINGS[ENV].pressureWRG511}
            label="WRG511 CH010"
          />
          <VolumePanel.SensorPressureConnected
            pvname={PV_SETTINGS[ENV].pressureWRG512}
            label="WRG512 CH030"
          />
          <VolumePanel.SensorPressureConnected
            pvname={PV_SETTINGS[ENV].pressureWRG513}
            label="WRG513 CH010"
          />
        </VolumePanel.Card>
      </VolumePanel.Container>
      <VolumePanel.Container>
        <VolumePanel.Label label="L3BT S1 Turbopump TMP511, CH501" />
        <VolumePanel.PumpSpeedConnected pvname={PV_SETTINGS[ENV].pumpTMP511} />
        <VolumePanel.Row>
          <VolumePanel.ValueUnitConnected pvname={PV_SETTINGS[ENV].rpmTMP511} />

          <VolumePanel.ValueUnitConnected
            pvname={PV_SETTINGS[ENV].tempTMP511}
          />
        </VolumePanel.Row>
      </VolumePanel.Container>
      <VolumePanel.Container>
        <VolumePanel.Label label="L3BT S1 Turbopump TMP512, CH503" />
        <VolumePanel.PumpSpeedConnected pvname={PV_SETTINGS[ENV].pumpTMP512} />
        <VolumePanel.Row>
          <VolumePanel.ValueUnitConnected pvname={PV_SETTINGS[ENV].rpmTMP512} />
          <VolumePanel.ValueUnitConnected
            pvname={PV_SETTINGS[ENV].tempTMP512}
          />
        </VolumePanel.Row>
      </VolumePanel.Container>
    </VolumePanel>
  )
}
