import { VolumePanel } from '@/components/ws-components/volume-panel'

/**
 * Roughing component for P3 controls
 * Displays roughing line pressure and pump status information
 */
export const Roughing = () => {
  return (
    <VolumePanel title="Roughing">
      {/* Backing line pressure section */}
      <VolumePanel.SensorBar
        title="Roughing Line, P3 Outlet"
        label="Pressure"
        height="20rem"
        sensorPVs={[{ pvName: 'E3-P3-APG802:PRESSURE', label: 'APG801' }]} //Add PV
      />

      {/* TODO nevime PVcka */}
      <VolumePanel.Pump
        title="Roughing Pump P000"
        rpmPV="AI_RPM_SPEED_P000" //Add PV
        valvePv="BI_PUMP_GV000" //Add PV
        valveLabel="GV000"
      />

      <VolumePanel.Locking
        label="Used and Locked By"
        pvName="SI_LOCKED" //Add PV
      />
    </VolumePanel>
  )
}
