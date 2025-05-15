import { VolumePanel } from '@/app/ws-components/volume-panel'

/**
 * Backing component for P3 controls
 * Displays backing line pressure and pump status information
 */
export const Backing = () => {
  return (
    <VolumePanel>
      <VolumePanel.Title label="P3 Backing" />
      {/* Backing line pressure section */}
      <VolumePanel.Container>
        <VolumePanel.Label label="P3 Backing line" />
        <VolumePanel.Card>
          <VolumePanel.CardLabel>Pressure</VolumePanel.CardLabel>
          <VolumePanel.SensorPressureConnected
            pvname="AI_MBAR_APG802"
            label="APG802"
          />
        </VolumePanel.Card>
      </VolumePanel.Container>

      {/* Backing pump status section */}
      <VolumePanel.Container>
        <VolumePanel.Label label="P3 Backing Pump P01" />
        <VolumePanel.PumpSpeedConnected pvname="AI_RPM_SPEED_P01" />
        <VolumePanel.ValveStatusConnected pvname="BI_PUMP_P01" label="GV154" />
      </VolumePanel.Container>
    </VolumePanel>
  )
}
