import { Meter } from '@/app/ws-components/meter'

/**
 * Roughing component for P3 controls
 * Displays roughing line pressure and pump status information
 */
export const Roughing = () => {
  return (
    <Meter>
      <Meter.Title label="Roughing" />
      {/* Backing line pressure section */}
      <Meter.PumpContainer>
        <Meter.Label label="Roughing Line, P3 Outlet" />
        <Meter.Card>
          <Meter.CardLabel>Pressure</Meter.CardLabel>
          <Meter.SensorPressureConnected
            pvname="AI_MBAR_APG801"
            label="APG801"
          />
        </Meter.Card>
      </Meter.PumpContainer>

      {/* Backing pump status section */}
      <Meter.PumpContainer>
        <Meter.Label label="Roughing Pump P04" />
        <Meter.PumpSpeedConnected pvname="AI_RPM_SPEED_P04" />
        <Meter.ValveStatusConnected pvname="BI_PUMP_P01" label="GV821" />
      </Meter.PumpContainer>
      <Meter.PumpContainer>
        <Meter.Label label="Used And Locked By" />
        <Meter.PureValueConnected pvname="SI_LOCKED" />
      </Meter.PumpContainer>
    </Meter>
  )
}
