import { Meter } from '@/app/ws-components/meter'

/**
 * Backing component for L3BT controls
 * Displays backing line pressure and pump status information
 */
export const Backing = () => {
  return (
    <Meter>
      <Meter.Title label="L3BT Backing" />
      {/* Backing line pressure section */}
      <Meter.PumpContainer>
        <Meter.Label label="L3BT Backing line" />
        <Meter.Card>
          <Meter.CardLabel>Pressure</Meter.CardLabel>
          <Meter.SensorPressureConnected
            pvname="AI_MBAR_APG802"
            label="APG512 CH010"
          />
          <Meter.SensorPressureConnected
            pvname="AI_MBAR_APG532i"
            label="APG532 CH055"
          />
        </Meter.Card>
      </Meter.PumpContainer>

      {/* Backing pump status section */}
      <Meter.PumpContainer>
        <Meter.Label label="L3BT Backing Pump P06" />
        <Meter.PumpSpeedConnected pvname="AI_RPM_SPEED_P06" />
        <Meter.ValveStatusConnected pvname="BI_PUMP_P06" label="GV220" />
      </Meter.PumpContainer>
    </Meter>
  )
}
