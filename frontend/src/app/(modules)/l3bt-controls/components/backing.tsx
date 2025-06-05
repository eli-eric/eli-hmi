import { VolumePanel } from '@/components/ws-components/volume-panel'
import { ENV } from '@/types/constants'

/**
 * Backing component for L3BT controls
 * Displays backing line pressure and pump status information
 */

const PV_SETTINGS = {
  development: {
    pressureAPG512: 'AI_MBAR_L3BT-VCS-APG512:PRESSURE',
    pressureAPG532: 'AI_MBAR_L3BT-VCS-APG532:PRESSURE',
    pumpSpeed: 'AI_SPEED_P06', //TODO
    valveStatus: 'BI_PUMP_P06', //TODO
  },
  production: {
    pressureAPG512: 'L3BT-VCS-APG512:PRESSURE',
    pressureAPG532: 'L3BT-VCS-APG532:PRESSURE',
    pumpSpeed: 'L3BT-PUMP-P06:SPEED', //TODO
    valveStatus: 'L3BT-PUMP-P06:VALVE_STATUS', //TODO
  },
  test: {
    pressureAPG512: 'AI_MBAR_L3BT-VCS-APG512:PRESSURE',
    pressureAPG532: 'AI_MBAR_L3BT-VCS-APG532:PRESSURE',
    pumpSpeed: 'AI_SPEED_P06_TEST', //TODO
    valveStatus: 'BI_PUMP_P06_TEST', //TODO
  },
}

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
            pvname={PV_SETTINGS[ENV].pressureAPG512}
            label="APG512 CH010"
          />
          <VolumePanel.SensorPressureConnected
            pvname={PV_SETTINGS[ENV].pressureAPG532}
            label="APG532 CH055"
          />
        </VolumePanel.Card>
      </VolumePanel.Container>

      {/* Backing pump status section */}
      <VolumePanel.Container>
        <VolumePanel.Label label="L3BT Backing Pump P06" />
        <VolumePanel.PumpSpeedConnected pvname={PV_SETTINGS[ENV].pumpSpeed} />
        <VolumePanel.ValveStatusConnected
          pvname={PV_SETTINGS[ENV].valveStatus}
          label="GV220"
        />
      </VolumePanel.Container>
    </VolumePanel>
  )
}
