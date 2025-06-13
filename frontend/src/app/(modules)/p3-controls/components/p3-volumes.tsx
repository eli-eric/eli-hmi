import { VolumePanel } from '@/components/ws-components/volume-panel'

const P3Chamber = () => {
  return (
    <VolumePanel.Container width="12rem">
      <VolumePanel.SensorBar
        title="P3 Chamber"
        label="Pressure"
        height="23.1rem"
        sensorPVs={[
          {
            pvName: 'AI_MBAR_WRG801',
            label: 'WRG801',
          },
          {
            pvName: 'AI_MBAR_WRG802',
            label: 'WRG802',
          },
          {
            pvName: 'AI_MBAR_WRG803',
            label: 'WRG803',
          },
        ]}
        stateControl={{
          pvCurrentState: 'E3-P3-P3_CHAMBER:STATUS',
          pvTargetState: 'E3-P3-P3_CHAMBER:TARGET', // TODO zatim nevim
          controlPvs: [
            {
              label: 'Standby',
              pvName: 'E3-P3-P3:SET_STANDBY',
            },
            {
              label: 'High vacuum',
              pvName: 'E3-P3-P3:SET_HIGH_VACUUM',
            },
            {
              label: 'Silent mode',
              pvName: 'E3-P3-P3:SET_HV_SILENT',
            },
            {
              label: 'Gas inject mode',
              pvName: 'E3-P3-P3:SET_HV_GAS_INJECT',
            },
            {
              label: 'Vent',
              pvName: 'E3-P3-P3:SET_VENTED',
            },
          ],
        }}
        pumpCyclePv="E3-P3-P3_CHAMBER:PUMP_CYCLE" // TODO zatim nevim
      />
    </VolumePanel.Container>
  )
}

const P3CRYO1 = () => {
  return (
    <VolumePanel.Container width="12rem">
      <VolumePanel.SensorBar
        label="Temperature"
        title="P3 CRYO1"
        height="23.1rem"
        sensorPVs={[
          {
            pvName: 'E3-P3-CRYO801:TEMP',
            label: 'XYZ000',
            options: { format: 'precision' },
          },
        ]}
        stateControl={{
          pvCurrentState: 'E3-P3-CRYO1:STATUS',
          pvTargetState: 'E3-P3-CRYO1:TARGET', // TODO zatim nevime
          controlPvs: [
            {
              pvName: 'E3-P3-CRYO1:START_COOLING',
              label: 'Start Cooling',
            },
            {
              pvName: 'E3-P3-CRYO1:STOP',
              label: 'Stop',
            },
            {
              pvName: 'E3-P3-CRYO1:VENT',
              label: 'Vent',
            },
            {
              pvName: 'E3-P3-CRYO1:START_REGEN',
              label: 'Start Regeneration',
            },
          ],
        }}
      />
      <VolumePanel.SensorBar
        label="Pressure"
        height="10.3rem"
        sensorPVs={[
          {
            pvName: 'E3-P3-APG804:PRESSURE',
            label: 'APG804',
            options: { format: 'exponencial' },
          },
        ]}
      />
    </VolumePanel.Container>
  )
}

const P3CRYO2 = () => {
  return (
    <VolumePanel.Container width="12rem">
      <VolumePanel.SensorBar
        label="Temperature"
        title="P3 CRYO2"
        height="23.1rem"
        sensorPVs={[
          {
            pvName: 'E3-P3-CRYO802:TEMP',
            label: 'XYZ000',
            options: { format: 'precision' },
          },
        ]}
        stateControl={{
          pvCurrentState: 'E3-P3-CRYO2:STATUS',
          pvTargetState: 'E3-P3-CRYO2:TARGET', // TODO zatim nevime
          controlPvs: [
            {
              pvName: 'E3-P3-CRYO2:START_COOLING',
              label: 'Start Cooling',
            },
            {
              pvName: 'E3-P3-CRYO2:STOP',
              label: 'Stop',
            },
            {
              pvName: 'E3-P3-CRYO2:VENT',
              label: 'Vent',
            },
            {
              pvName: 'E3-P3-CRYO2:START_REGEN',
              label: 'Start Regeneration',
            },
          ],
        }}
      />

      <VolumePanel.SensorBar
        label="Pressure"
        height="10.3em"
        sensorPVs={[
          {
            pvName: 'E3-P3-APG805:PRESSURE',
            label: 'APG805',
            options: { format: 'exponencial' },
          },
        ]}
      />
    </VolumePanel.Container>
  )
}

const P3Configuration = () => {
  return (
    <VolumePanel.Container width="12rem" gap="0.3rem">
      <VolumePanel.Config
        title="P3 Configuration"
        stateControl={{
          pvCurrentState: 'SI_???' /* TODO zatim nevim */,
          pvTargetState: 'SI_???' /* TODO zatim nevim */,
          controlPvs: [],
        }}
      />

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
      <VolumePanel.MasterKey title="P3 Master Key" pvName="BI_PURE_KEY_P3" />
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

/**
 * P3 Volumes component
 *
 * This component displays the P3 volumes and their respective sensors.
 * It uses the VolumePanel component to create a structured layout.
 *
 * @returns {JSX.Element} The P3 Volumes component.
 */

export const P3Volumes = () => {
  return (
    <VolumePanel width="100%" title="P3">
      <VolumePanel.MultiVolumes>
        <P3Chamber />
        <P3CRYO1 />
        <P3CRYO2 />
        <P3Configuration />
      </VolumePanel.MultiVolumes>
    </VolumePanel>
  )
}
