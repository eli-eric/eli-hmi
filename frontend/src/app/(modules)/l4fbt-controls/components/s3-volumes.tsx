import { VolumePanel } from '@/components/ws-components/volume-panel'

export const S3Volume = () => {
  return (
    <VolumePanel.Container width="12rem">
      <VolumePanel.SensorBar
        title="L4fBT S3 Volume"
        label="Pressure"
        stateControl={{
          pvCurrentState: 'undefined1:STATUS', //Add PV
          pvTargetState: 'undefined1:TARGET', //Add PV
          controlPvs: [
            {
              label: 'Standby',
              pvName: 'undefined2:SET_STANDBY', //Add PV
            },
            {
              label: 'High vacuum',
              pvName: 'undefined3:PUMP', //Add PV
            },
            {
              label: 'Vent',
              pvName: 'undefined4:VENT', //Add PV
            },
            {
              label: 'Purge',
              pvName: 'undefined5:PURGE', //Add PV
            },
          ],
        }}
        sensorPVs={[
          {
            pvName: 'undefined6:PRESSURE', //Add PV
            label: 'WRG583',
          },
          {
            pvName: 'undefined7:PRESSURE', //Add PV
            label: 'WRG584',
          },
          {
            pvName: 'undefined8:PRESSURE', //Add PV
            label: 'APG586',
          },
        ]}
      />
    </VolumePanel.Container>
  )
}

export const S3Doors = () => {
  return (
    <VolumePanel.Container width="12rem">
      <VolumePanel.Doors
        title="P3 Doors"
        sensorPV={{
          label: 'APG809',
          pvName: 'E3-P3-APG809:PRESSURE', // TODO zatim nevim
        }}
        stateControl={{
          pvCurrentState: 'SI_???', // TODO zatim nevim
          pvTargetState: 'SI_???', // TODO zatim nevim
          controlPvs: [
            {
              label: 'Standby',
              pvName: 'E3-P3-DOOR_LINE:STANDBY',
            },
            {
              label: 'Pump',
              pvName: 'E3-P3-DOOR_LINE:PUMP',
            },
          ],
        }}
        doorsPVs={['E3-P3-D1:CLOSED', 'E3-P3-D2:CLOSED', 'E3-P3-D3:CLOSED']}
      />
      <VolumePanel.TurbopumpBasic
        label="P3 Turbopump TMP801"
        statusPV="E3-P3-TMP801:STATUS"
        stateControl={{
          checkClearPv: 'E3-P3-TMP801:RESET',
          errorPv: 'E3-P3-TMP801:NO_ALARM',
          warningPv: 'E3-P3-TMP801:NO_WARNING',
        }}
        rpmPV="AI_RPM_SPEED_P04" // TODO zatim nevim
        tempPV="AI_TEMP_P04" // TODO zatim nevim
      />
      <VolumePanel.TurbopumpBasic
        label="P3 Turbopump TMP802"
        statusPV="E3-P3-TMP802:STATUS"
        stateControl={{
          checkClearPv: 'E3-P3-TMP802:RESET',
          errorPv: 'E3-P3-TMP802:NO_ALARM',
          warningPv: 'E3-P3-TMP802:NO_WARNING',
        }}
        rpmPV="AI_RPM_SPEED_P04" // TODO zatim nevim
        tempPV="AI_TEMP_P04" // TODO zatim nevim
      />
    </VolumePanel.Container>
  )
}

export const S3SafetyKey = () => {
  return (
    <VolumePanel.Container width="12rem">
      <VolumePanel.MasterKey title="P3 Master Key" pvName="BI_PURE_KEY_P3" />
    </VolumePanel.Container>
  )
}

export const S3Volumes = () => {
  return (
    <VolumePanel width="100%" title="L4fBT S3">
      <VolumePanel.MultiVolumes>
        <S3Volume />
        <S3Doors />
        <S3SafetyKey />
      </VolumePanel.MultiVolumes>
    </VolumePanel>
  )
}
