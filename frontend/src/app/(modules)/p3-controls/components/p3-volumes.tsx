import { VolumePanel } from '@/components/ws-components/volume-panel'

const P3Chamber = () => {
  return (
    <VolumePanel.Container width="12rem">
      <VolumePanel.SensorBar
        title="P3 Chamber"
        label="Pressure"
        height="23rem"
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
      />

      <VolumePanel.Card title="Total Pump Cycles" height="13.7rem">
        <VolumePanel.SensorValueConnected
          options={{ format: 'precision' }}
          pvname="AI_PUMP_CYCLES_P3"
        />
      </VolumePanel.Card>
    </VolumePanel.Container>
  )
}

const P3CRYO1 = () => {
  return (
    <VolumePanel.Container width="12rem">
      <VolumePanel.SensorBar
        label="Temperature"
        title="P3 CRYO1"
        height="20rem"
        sensorPVs={[
          {
            pvName: 'E3-P3-CRYO801:TEMP',
            label: 'XYZ000',
            options: { format: 'precision' },
          },
        ]}
        stateControl={{
          pvName: 'E3-P3-CRYO1:STATUS',
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
        height="13.7rem"
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
        height="20rem"
        sensorPVs={[
          {
            pvName: 'E3-P3-CRYO802:TEMP',
            label: 'XYZ000',
            options: { format: 'precision' },
          },
        ]}
        stateControl={{
          pvName: 'E3-P3-CRYO2:STATUS',
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
        height="13.7rem"
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
      <VolumePanel.Container>
        <VolumePanel.Label label="P3 Configuration" />
        <VolumePanel.StateControl />
      </VolumePanel.Container>
      <VolumePanel.Container>
        <VolumePanel.Label label="P3 Doors" />
        <VolumePanel.Card>
          <VolumePanel.SensorPressureConnected
            label="APG809"
            pvname="AI_MBAR_APG809"
          />
        </VolumePanel.Card>
        <VolumePanel.StateControl />
        <VolumePanel.Card>
          <div>All Doors are Closed</div>
        </VolumePanel.Card>
      </VolumePanel.Container>
      <VolumePanel.Container>
        <VolumePanel.Label label="P3 Master Key" />
        <VolumePanel.PureValueConnected pvname="SI_PURE_KEY_P3" />
      </VolumePanel.Container>
      <VolumePanel.Container>
        <VolumePanel.Label label="P3 Turbopump TMP801" />
        <VolumePanel.PumpSpeedConnected pvname="AI_TMP801" />
        <VolumePanel.WarningErrorControl PVs={['BI_WARN', 'BI_ERROR']} />
        <VolumePanel.Row>
          <VolumePanel.ValueUnitConnected pvname="AI_RPM_TMP801" />
          <VolumePanel.ValueUnitConnected pvname="AI_TEMP_TMP801" />
        </VolumePanel.Row>
      </VolumePanel.Container>
      <VolumePanel.Container>
        <VolumePanel.Label label="P3 Turbopump TMP802" />
        <VolumePanel.PumpSpeedConnected pvname="AI_TMP801" />
        <VolumePanel.WarningErrorControl PVs={['BI_WARN', 'BI_ERROR']} />
        <VolumePanel.Row>
          <VolumePanel.ValueUnitConnected pvname="AI_RPM_TMP802" />
          <VolumePanel.ValueUnitConnected pvname="AI_TEMP_TMP802" />
        </VolumePanel.Row>
      </VolumePanel.Container>
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
