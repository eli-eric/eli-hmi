import { VolumePanel } from '@/app/ws-components/VolumePanel'

/**
 * Roughing component for P3 controls
 * Displays roughing line pressure and pump status information
 */
export const Roughing = () => {
  return (
    <VolumePanel>
      <VolumePanel.Title label="Roughing" />
      {/* Backing line pressure section */}
      <VolumePanel.PumpContainer>
        <VolumePanel.Label label="Roughing Line, P3 Outlet" />
        <VolumePanel.Card>
          <VolumePanel.CardLabel>Pressure</VolumePanel.CardLabel>
          <VolumePanel.SensorPressureConnected
            pvname="AI_MBAR_APG501"
            label="APG501 CH030"
          />
          <VolumePanel.SensorPressureConnected
            pvname="AI_MBAR_APG531"
            label="APG531 CH040"
          />
        </VolumePanel.Card>
      </VolumePanel.PumpContainer>

      {/* Backing pump status section */}
      <VolumePanel.PumpContainer>
        <VolumePanel.Label label="Roughing Pump P04" />
        <VolumePanel.PumpSpeedConnected pvname="AI_RPM_SPEED_P04" />
        <VolumePanel.ValveStatusConnected pvname="BI_PUMP_P04" label="GV821" />
      </VolumePanel.PumpContainer>
      <VolumePanel.PumpContainer>
        <VolumePanel.Label label="Used And Locked By" />
        <VolumePanel.PureValueConnected pvname="SI_LOCKED" />
      </VolumePanel.PumpContainer>
    </VolumePanel>
  )
}
