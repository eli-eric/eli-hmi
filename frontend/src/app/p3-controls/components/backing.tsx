import { Meter } from '@/app/ws-components/meter'

/**
 * Backing component for P3 controls
 * Displays backing line pressure and pump status information
 */
export const Backing = () => {
  return (
    <Meter>
      <Meter.Title label="P3 Backing" />
      {/* Backing line pressure section */}
      <Meter.PumpContainer>
        <Meter.Label label="P3 Backing line" />
        <Meter.Card>
          <Meter.CardLabel>Pressure</Meter.CardLabel>
          <Meter.SensorPressureConnected
            pvname="AI_MBAR_APG802"
            label="APG802"
          />
        </Meter.Card>
      </Meter.PumpContainer>

      {/* Backing pump status section */}
      <Meter.PumpContainer>
        <Meter.Label label="P3 Backing Pump P01" />
        <Meter.PumpSpeedConnected pvname="AI_RPM_SPEED_P01" />
        <Meter.ValveStatusConnected pvname="BI_PUMP_P01" label="GV154" />
      </Meter.PumpContainer>
    </Meter>
  )
}
