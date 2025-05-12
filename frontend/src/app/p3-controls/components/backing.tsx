import { Meter } from '@/app/ws-components/meter'

export const Backing = () => {
  return (
    <Meter>
      <Meter.Title label="L3BT Backing" />

      <Meter.Container>
        <Meter.Label label="P3 Backing line" />
        <Meter.Card>
          <Meter.CardLabel>Pressure</Meter.CardLabel>
          <Meter.SensorPressurePV
            pvname="AI_MBAR_APG512"
            label="APG512 CH010"
          />
          <Meter.SensorPressurePV
            pvname="AI_MBAR_APG532"
            label="APG532 CH055"
          />
        </Meter.Card>
      </Meter.Container>
      <Meter.Container>
        <Meter.Label label="P3 Backing Pump P01" />
        <Meter.SensorPumpSpeedPV pvname="AI_RPM_SPEED_P01" />
        <Meter.SensorPumpOpenPV pvname="BI_PUMP_P01" label="GV154" />
      </Meter.Container>
    </Meter>
  )
}
