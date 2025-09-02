'use client'
import { VolumePanel } from '@/components/ws-components/volume-panel'

/**
 * L3BTMachineSafetyPermission component
 *
 * Displays the L3BT machine safety permissions using the refactored VolumePanel.Interlocks component
 */

export const L3BTMachineSafetyPermission = () => {
  return (
    <VolumePanel width="16rem" title="L3BT Machine Safety Permissions">
      <VolumePanel.Interlocks
        interlocksPVs={[
          {
            pvname: 'L3BT-MSS:S1_ROUGHING_PERMISSION',
            title: 'L3BT S1 Volume Roughing',
          },
          {
            pvname: 'L3BT-MSS:S1_HIGH_VAC_PERMISSION',
            title: 'L3BT S1 Volume High Vacuum Pumping',
          },
          {
            pvname: 'L3BT-MSS:S3_ROUGHING_PERMISSION',
            title: 'L3BT S3 Volume Roughing',
          },
          {
            pvname: 'L3BT-MSS:S3_HIGH_VAC_PERMISSION',
            title: 'L3BT S3 Volume High Vacuum Pumping',
          },
          {
            pvname: 'L3BT-VCS-SGV503_toOpen:INTERLOCK', //Add PV
            title: 'Valve SGV503 to Open',
          },
          {
            pvname: 'L3BT-VCS-EGV501_toOpen:INTERLOCK', //Add PV
            title: 'Valve EGV501 to Open',
          },
        ]}
      />
    </VolumePanel>
  )
}
