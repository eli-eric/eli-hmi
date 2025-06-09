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
    <VolumePanel width="13rem" title="L3BT S1">
      <VolumePanel.SensorBar
        title="L3BT S1 Volume"
        label="Pressure"
        stateControl={{
          pvName: PV_SETTINGS[ENV].pressureWRG511,
          controlPvs: [
            {
              label: 'Roughing Valve',
              pvName: PV_SETTINGS[ENV].pressureWRG511,
            },
          ],
        }}
        sensorPVs={[
          {
            pvName: PV_SETTINGS[ENV].pressureWRG511,
            label: 'WRG511 CH010',
          },
          {
            pvName: PV_SETTINGS[ENV].pressureWRG512,
            label: 'WRG512 CH030',
          },
          {
            pvName: PV_SETTINGS[ENV].pressureWRG513,
            label: 'WRG513 CH010',
          },
        ]}
      />

      <VolumePanel.TurbopumpBasic
        label="L3BT S1 Turbopump TMP511, CH501"
        statusPV={PV_SETTINGS[ENV].pumpTMP511}
        rpmPV={PV_SETTINGS[ENV].rpmTMP511}
        tempPV={PV_SETTINGS[ENV].tempTMP511}
      />
      <VolumePanel.TurbopumpBasic
        label="L3BT S1 Turbopump TMP512, CH503"
        statusPV={PV_SETTINGS[ENV].pumpTMP512}
        rpmPV={PV_SETTINGS[ENV].rpmTMP512}
        tempPV={PV_SETTINGS[ENV].tempTMP512}
      />
    </VolumePanel>
  )
}
