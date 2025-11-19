import { VolumePanel } from '@/components/ws-components/volume-panel'
import { ENV } from '@/types/constants'

/**
 * Roughing component for P3 controls
 * Displays roughing line pressure and pump status information
 */

const PV_SETTINGS = {
  development: {
    pumpSpeed: 'AI_SPEED_P04', // TODO
    valveStatus: 'BI_PUMP_P04', // TODO
    lockedBy: 'SI_LOCKED', // TODO
    p04Pump: 'AI_L3BT-VCS-PUMP-P04:ActualFrequency', // TODO
    p04Valve: 'BI_p04valve', // TODO
  },
  production: {
    pumpSpeed: 'L3BT-PUMP-P04:SPEED', // TODO
    valveStatus: 'L3BT-PUMP-P04:VALVE_STATUS', // TODO
    lockedBy: 'L3BT-LOCKED:SENSOR', // TODO
    p04Pump: 'L3BT-VCS-PUMP-P04:ActualFrequency', // TODO
    p04Valve: 'L3BT-PUMP-P04:VALVE', // TODO
  },
  test: {
    pumpSpeed: 'AI_SPEED_P04_TEST', // TODO
    valveStatus: 'BI_PUMP_P04_TEST', // TODO
    lockedBy: 'SI_LOCKED_TEST', // TODO
    p04Pump: 'AI_L3BT-VCS-PUMP-P04_TEST:ActualFrequency', // TODO
    p04Valve: 'BI_p04valve_test', // TODO
  },
}

export const Roughing = () => {
  return (
    <VolumePanel title="Roughing" width="100%">
      <VolumePanel.Container width="9rem">
        <VolumePanel.SensorBar
          title="Roughing Line L4fBT Outlet"
          label="Pressure"
          height="20rem"
          sensorPVs={[{ pvName: 'undefined1:PRESSURE', label: 'APG584' }]} //Add PV
        />
        <VolumePanel.Pump
          title="Roughing Pump P00"
          rpmPV={PV_SETTINGS[ENV].p04Pump}
          valvePv={PV_SETTINGS[ENV].p04Valve}
          valveLabel="GV000"
        />
        <VolumePanel.Locking
          label="Used And Locked By"
          pvName="SI_LOCKED_TEST"
        />
      </VolumePanel.Container>
    </VolumePanel>
  )
}
