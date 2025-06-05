import { VolumePanel } from '@/components/ws-components/volume-panel'

const P3Chamber = () => {
  return (
    <VolumePanel.Container width="12rem">
      <VolumePanel.Label label="P3 Chamber" />
      <VolumePanel.StateControl />
      <VolumePanel.Card title="Pressure" height="20rem">
        <VolumePanel.SensorPressureConnected
          format="exponencial"
          label="WRG801"
          pvname="AI_MBAR_WRG801"
        />
        <VolumePanel.SensorPressureConnected
          label="WRG802"
          format="exponencial"
          pvname="AI_MBAR_WRG802"
        />
        <VolumePanel.SensorPressureConnected
          label="WRG803"
          format="exponencial"
          pvname="AI_MBAR_WRG803"
        />
      </VolumePanel.Card>
      <VolumePanel.Card title="Total Pump Cycles" height="13.7rem">
        <VolumePanel.SensorValueConnected
          format="precision"
          pvname="AI_PUMP_CYCLES_P3"
        />
      </VolumePanel.Card>
    </VolumePanel.Container>
  )
}

const P3CRYO1 = () => {
  return (
    <VolumePanel.Container width="12rem">
      <VolumePanel.Label label="P3 CRYO1" />
      <VolumePanel.StateControl />
      <VolumePanel.Card title="Tempenture" height="20rem">
        <VolumePanel.SensorPressureConnected
          format="precision"
          label="XYZ000"
          pvname="AI_K_XYZ000"
        />
      </VolumePanel.Card>
      <VolumePanel.Card title="Pressure" height="13.7rem">
        <VolumePanel.SensorPressureConnected
          label="APG804"
          pvname="AI_MBAR_APG804"
          format="exponencial"
        />
      </VolumePanel.Card>
    </VolumePanel.Container>
  )
}

const P3CRYO2 = () => {
  return (
    <VolumePanel.Container width="12rem">
      <VolumePanel.Label label="P3 CRYO2" />
      <VolumePanel.StateControl />
      <VolumePanel.Card title="Tempenture" height="20rem">
        <VolumePanel.SensorPressureConnected
          label="XYZ001"
          pvname="AI_K_XYZ001"
        />
      </VolumePanel.Card>
      <VolumePanel.Card title="Pressure" height="13.7rem">
        <VolumePanel.SensorPressureConnected
          label="APG805"
          format="exponencial"
          pvname="AI_MBAR_APG805"
        />
      </VolumePanel.Card>
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
    <VolumePanel width="100%">
      <VolumePanel.Title label="P3" />
      <VolumePanel.MultiVolumes>
        <P3Chamber />
        <P3CRYO1 />
        <P3CRYO2 />
        <P3Configuration />
      </VolumePanel.MultiVolumes>
    </VolumePanel>
  )
}
