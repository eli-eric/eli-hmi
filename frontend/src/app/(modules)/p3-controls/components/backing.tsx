import { VolumePanel } from '@/components/ws-components/volume-panel'

/**
 * Backing component for P3 controls
 * Displays backing line pressure and pump status information
 */
export const Backing = () => {
  return (
    <VolumePanel title="P3 Backing">
      <VolumePanel.SensorBar
        height="20rem"
        label="Pressure"
        title="P3 Backing Line"
        sensorPVs={[{ pvName: 'AI_MBAR_APG802', label: 'APG802' }]}
      />

      {/* Backing pump status section */}
      <VolumePanel.Pump
        label="P3 Backing Pump P01"
        rpmPV="AI_RPM_SPEED_P01"
        valvePv="BI_PUMP_P01"
        valveLabel="GV154"
      />
    </VolumePanel>
  )
}
