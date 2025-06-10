import { VolumePanel } from '@/components/ws-components/volume-panel'

export const S3Volume = () => {
  return (
    <VolumePanel width="13rem" title="L3BT S3">
      <VolumePanel.SensorBar
        height="20rem"
        title="L3BT S3 Volume"
        label="Pressure"
        stateControl={{
          pvCurrentState: 'L3BT-VCS-S3:STATUS',
          pvTargetState: 'L3BT-VCS-S3:TARGET', // TODO
          controlPvs: [
            {
              label: 'Standby',
              pvName: 'L3BT-VCS-S3:SET_STANDBY',
            },
            {
              label: 'High vacuum',
              pvName: 'L3BT-VCS-S3:PUMP',
            },
            {
              label: 'Vent',
              pvName: 'L3BT-VCS-S3:VENT',
            },
            {
              label: 'Purge',
              pvName: 'L3BT-VCS-S3:PURGE',
            },
          ],
        }}
        sensorPVs={[
          {
            pvName: 'L3BT-VCS-WRG531:PRESSURE',
            label: 'WRG531 CH055',
          },
          {
            pvName: 'L3BT-VCS-WRG532:PRESSURE',
            label: 'WRG532 CH040',
          },
          {
            pvName: 'L3BT-VCS-APG533:PRESSURE',
            label: 'APG533 CH055',
          },
        ]}
      />
      <VolumePanel.TurbopumpBasic
        label="L3BT S1 Turbopump TMP532, Pipe"
        statusPV="L3BT-VCS-TMP532:ActualFrequency" // TODO
        rpmPV="L3BT-VCS-TMP532:ActualFrequency"
        tempPV="L3BT-VCS-TMP532:ActualConverterTemperature"
      />
      <VolumePanel.TurbopumpBasic
        label="L3BT S1 Turbopump TMP531, CH504"
        statusPV="L3BT-VCS-TMP531:ActualFrequency" // TODO
        rpmPV="L3BT-VCS-TMP531:ActualFrequency"
        tempPV="L3BT-VCS-TMP531:ActualConverterTemperature"
      />
    </VolumePanel>
  )
}
