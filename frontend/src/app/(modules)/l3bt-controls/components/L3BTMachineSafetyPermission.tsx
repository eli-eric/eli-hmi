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
            title: 'S1 Roughing',
          },
          {
            pvname: 'L3BT-MSS:S1_HIGH_VAC_PERMISSION',
            title: 'S1 High Vacuum Pumping',
          },
          {
            pvname: 'L3BT-MSS:S3_ROUGHING_PERMISSION',
            title: 'S3 Roughing',
          },
          {
            pvname: 'L3BT-MSS:S3_HIGH_VAC_PERMISSION',
            title: 'S3 High Vacuum Pumping',
          },
        ]}
      />
    </VolumePanel>
  )
}
