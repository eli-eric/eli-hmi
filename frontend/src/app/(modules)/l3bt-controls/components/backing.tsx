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
            pvname={'L3BT-VCS-APG512:PRESSURE'}
            label="APG512 CH010"
          />
          <VolumePanel.SensorPressureConnected
            pvname={'AI_MBAR_L3BT-VCS-APG532:PRESSURE'}
            label="APG532 CH055"
          />
        </VolumePanel.Card>
      </VolumePanel.Container>

      {/* Backing pump status section */}
      <VolumePanel.Pump
        label="L3BT Backing Pump P06"
        rpmPV="AI_SPEED_P06_TEST:ActualFrequency"
        valvePv="BI_PUMP_P06_TEST:OPEN"
        valveLabel="GV220"
      />
    </VolumePanel>
  )
}
