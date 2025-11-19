'use client'
import { VolumePanel } from '@/components/ws-components/volume-panel'

/**
 * L4fBTMachineSafetyPermission component
 *
 * Displays the L4fBT machine safety permissions using the refactored VolumePanel.Interlocks component
 */

export const L4fBTMachineSafetyPermission = () => {
  return (
    <VolumePanel width="16rem" title="L4fBT Machine Safety Permissions">
      <VolumePanel.Interlocks
        interlocksPVs={[
          {
            pvname: 'undefined3:S1_ROUGHING_PERMISSION', //Add PV
            title: 'L4fBT S3 Volume Roughing',
          },
          {
            pvname: 'undefined2:S1_HIGH_VAC_PERMISSION', //Add PV
            title: 'L4fBT S3 Volume High Vacuum Pumping',
          },
          {
            pvname: 'undefined1:S3_ROUGHING_PERMISSION', //Add PV
            title: 'Valve EGV802 to Open',
          },
        ]}
      />
    </VolumePanel>
  )
}
