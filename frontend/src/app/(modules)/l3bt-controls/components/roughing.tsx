import { VolumePanel } from '@/components/ws-components/volume-panel'
import { ENV } from '@/types/constants'

/**
 * Roughing component for P3 controls
 * Displays roughing line pressure and pump status information
 */

const PV_SETTINGS = {
  development: {
    pressureAPG511: 'AI_MBAR_L3BT-VCS-APG511:PRESSURE',
    pressureAPG531: 'AI_MBAR_L3BT-VCS-APG531:PRESSURE',
    pumpSpeed: 'AI_SPEED_P04', // TODO
    valveStatus: 'BI_PUMP_P04', // TODO
    lockedBy: 'SI_LOCKED', // TODO
    p04Pump: 'AI_L3BT-VCS-PUMP-P04:ActualFrequency', // TODO
    p04Valve: 'BI_p04valve', // TODO
  },
  production: {
    pressureAPG511: 'L3BT-VCS-APG511:PRESSURE',
    pressureAPG531: 'L3BT-VCS-APG531:PRESSURE',
    pumpSpeed: 'L3BT-PUMP-P04:SPEED', // TODO
    valveStatus: 'L3BT-PUMP-P04:VALVE_STATUS', // TODO
    lockedBy: 'L3BT-LOCKED:SENSOR', // TODO
    p04Pump: 'L3BT-VCS-PUMP-P04:ActualFrequency', // TODO
    p04Valve: 'L3BT-PUMP-P04:VALVE', // TODO
  },
  test: {
    pressureAPG511: 'AI_MBAR_L3BT-VCS-APG511:PRESSURE',
    pressureAPG531: 'AI_MBAR_L3BT-VCS-APG531:PRESSURE',
    pumpSpeed: 'AI_SPEED_P04_TEST', // TODO
    valveStatus: 'BI_PUMP_P04_TEST', // TODO
    lockedBy: 'SI_LOCKED_TEST', // TODO
    p04Pump: 'AI_L3BT-VCS-PUMP-P04_TEST:ActualFrequency', // TODO
    p04Valve: 'BI_p04valve_test', // TODO
  },
}

export const Roughing = () => {
  return (
    <VolumePanel>
      <VolumePanel.Title label="Roughing" />
      {/* Backing line pressure section */}
      <VolumePanel.Container>
        <VolumePanel.Label label="Roughing Line, P3 Outlet" />
        <VolumePanel.Card title="Pressure">
          <VolumePanel.SensorPressureConnected
            pvname={PV_SETTINGS[ENV].pressureAPG511}
            label="APG511 CH030"
          />
          <VolumePanel.SensorPressureConnected
            pvname={PV_SETTINGS[ENV].pressureAPG531}
            label="APG531 CH040"
          />
        </VolumePanel.Card>
      </VolumePanel.Container>
      {/* Backing pump status section */}
      <VolumePanel.Container>
        <VolumePanel.Label label="Roughing Pump P04" />
        <VolumePanel.PumpSpeedConnected pvname={PV_SETTINGS[ENV].p04Pump} />
        <VolumePanel.ValveStatusConnected
          pvname={PV_SETTINGS[ENV].p04Valve}
          label="GV821"
        />
      </VolumePanel.Container>
      <VolumePanel.Container>
        <VolumePanel.Label label="Used And Locked By" />
        <VolumePanel.PureValueConnected pvname={PV_SETTINGS[ENV].lockedBy} />
      </VolumePanel.Container>
    </VolumePanel>
  )
}
