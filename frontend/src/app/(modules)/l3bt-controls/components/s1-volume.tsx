import { VolumePanel } from '@/components/ws-components/volume-panel'

/**
 * S1Volume component
 *
 * Displays the L3BT S1 volume panel with pressure readings and turbopump information
 */
export const S1Volume = () => {
  return (
    <VolumePanel width="13rem" title="L3BT S1">
      <VolumePanel.SensorBar
        title="L3BT S1 Volume"
        label="Pressure"
        stateControl={{
          pvCurrentState: 'L3BT-VCS-S1:STATUS',
          pvTargetState: 'L3BT-VCS-S1:TARGET', // TODO
          controlPvs: [
            {
              label: 'Standby',
              pvName: 'L3BT-VCS-S1:SET_STANDBY',
            },
            {
              label: 'High vacuum',
              pvName: 'L3BT-VCS-S1:PUMP',
            },
            {
              label: 'Vent',
              pvName: 'L3BT-VCS-S1:VENT',
            },
            {
              label: 'Purge',
              pvName: 'L3BT-VCS-S1:PURGE',
            },
          ],
        }}
        sensorPVs={[
          {
            pvName: 'L3BT-VCS-WRG511:PRESSURE',
            label: 'WRG511 CH010',
          },
          {
            pvName: 'L3BT-VCS-WRG512:PRESSURE',
            label: 'WRG512 CH030',
          },
          {
            pvName: 'L3BT-VCS-APG513:PRESSURE',
            label: 'WRG513 CH010',
          },
        ]}
      />
      <VolumePanel.TurbopumpBasic
        label="L3BT S1 Turbopump TMP511, CH501"
        statusPV={'L3BT-VCS-TMP511:ActualFrequency'}
        rpmPV={'L3BT-VCS-TMP511:ActualFrequency'}
        tempPV={'L3BT-VCS-TMP511:ActualConverterTemperature'}
      />
      <VolumePanel.TurbopumpBasic
        label="L3BT S1 Turbopump TMP512, CH503"
        statusPV={'L3BT-VCS-TMP512:ActualFrequency'}
        rpmPV={'L3BT-VCS-TMP512:ActualFrequency'}
        tempPV={'L3BT-VCS-TMP512:ActualConverterTemperature'}
      />
    </VolumePanel>
  )
}
