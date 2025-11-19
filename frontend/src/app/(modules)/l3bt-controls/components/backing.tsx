import { VolumePanel } from '@/components/ws-components/volume-panel'

/**
 * Backing component for L3BT controls
 * Displays backing line pressure and pump status information
 */

export const Backing = () => {
  return (
    <VolumePanel title="L3BT Backing">
      {/* Backing line pressure section */}

      <VolumePanel.SensorBar
        title="L3BT Backing Line"
        label="Pressure"
        height="20rem"
        sensorPVs={[
          { pvName: 'L3BT-VCS-APG512:PRESSURE', label: 'APG512 CH010' },
          { pvName: 'L3BT-VCS-APG532:PRESSURE', label: 'APG532 CH055' },
        ]}
      />

      {/* Backing pump status section */}
      <VolumePanel.Pump
        title="L3BT Backing Pump P025"
        rpmPV="AI_SPEED_P06_TEST:ActualFrequency" //Add PV
        valvePv="BI_PUMP_P06_TEST:OPEN" //Add PV
        valveLabel="GV025"
      />
    </VolumePanel>
  )
}
