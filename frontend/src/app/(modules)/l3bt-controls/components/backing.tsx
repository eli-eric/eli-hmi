import { VolumePanel } from '@/components/ws-components/volume-panel'

/**
 * Backing component for L3BT controls
 * Displays backing line pressure and pump status information
 */
export const Backing = () => {
  return (
    <VolumePanel>
      <VolumePanel.Title label="L3BT Backing" />
      {/* Backing line pressure section */}
      <VolumePanel.Container>
        <VolumePanel.Label label="L3BT Backing line" />
        <VolumePanel.Card height="20rem">
          <VolumePanel.CardLabel>Pressure</VolumePanel.CardLabel>
          <VolumePanel.SensorPressureConnected
            pvname="AI_MBAR_APG802"
            label="APG512 CH010"
          />
          <VolumePanel.SensorPressureConnected
            pvname="AI_MBAR_APG532i"
            label="APG532 CH055"
          />
        </VolumePanel.Card>
      </VolumePanel.Container>

      {/* Backing pump status section */}
      <VolumePanel.Container>
        <VolumePanel.Label label="L3BT Backing Pump P06" />
        <VolumePanel.PumpSpeedConnected pvname="AI_RPM_SPEED_P06" />
        <VolumePanel.ValveStatusConnected pvname="BI_PUMP_P06" label="GV220" />
      </VolumePanel.Container>
    </VolumePanel>
  )
}
