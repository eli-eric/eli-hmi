import { VolumePanel } from '@/app/ws-components/volume-panel'

/**
 * Roughing component for P3 controls
 * Displays roughing line pressure and pump status information
 */
export const Roughing = () => {
  return (
    <VolumePanel>
      <VolumePanel.Title label="Roughing" />
      {/* Backing line pressure section */}
      <VolumePanel.Container>
        <VolumePanel.Label label="Roughing Line, P3 Outlet" />
        <VolumePanel.Card>
          <VolumePanel.CardLabel>Pressure</VolumePanel.CardLabel>
          <VolumePanel.SensorPressureConnected
            pvname="AI_MBAR_APG801"
            label="APG801"
          />
        </VolumePanel.Card>
      </VolumePanel.Container>

      {/* Backing pump status section */}
      <VolumePanel.Container>
        <VolumePanel.Label label="Roughing Pump P04" />
        <VolumePanel.PumpSpeedConnected pvname="AI_RPM_SPEED_P04" />
        <VolumePanel.ValveStatusConnected pvname="BI_PUMP_P01" label="GV821" />
      </VolumePanel.Container>
      <VolumePanel.Container>
        <VolumePanel.Label label="Used And Locked By" />
        <VolumePanel.PureValueConnected pvname="SI_LOCKED" />
      </VolumePanel.Container>
    </VolumePanel>
  )
}
