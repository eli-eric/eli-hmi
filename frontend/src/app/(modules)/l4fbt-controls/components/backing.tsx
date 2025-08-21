import { VolumePanel } from '@/components/ws-components/volume-panel'

/**
 * Backing component for L4fBT controls
 * Displays backing line pressure and pump status information
 */

export const Backing = () => {
  return (
    <VolumePanel title="L4fBT Backing" width="100%">
      <VolumePanel.Container width="9rem">
        {/* Backing line pressure section */}

        <VolumePanel.SensorBar
          title="L4fBT Backing Line"
          label="Pressure"
          height="20rem"
          sensorPVs={[
            { pvName: 'undefinded1:PRESSURE', label: 'APG585' }, //Add PV
          ]}
        />

        {/* Backing pump status section */}
        <VolumePanel.Pump
          title="Backing Pump P025"
          rpmPV="undefined3:ActualFrequency" //Add PV
          valvePv="undefined4:OPEN" //Add PV
          valveLabel="GV02"
        />
      </VolumePanel.Container>
    </VolumePanel>
  )
}
