'use client'

import { VolumePanel } from '@/components/ws-components/volume-panel'

/**
 * P3MachineSafetyPermission component
 *
 * Displays the P3 machine safety permissions using the refactored VolumePanel.Interlocks component
 */
// TODO PVs
export const P3MachineSafetyPermission = () => {
  return (
    <VolumePanel width="16rem" title="P3 Machine Safety Permissions">
      <VolumePanel.Interlocks
        interlocksPVs={[
          {
            pvname: 'L3BT_ROUGNING:INTERLOCK', // TODO
            title: 'Roughing',
          },
          {
            pvname: 'L3BT_HIGH_VACUUM_PUMPING:INTERLOCK', // TODO
            title: 'High Vacuum Pumping',
          },
          {
            pvname: 'L3BT_VENTING:INTERLOCK', // TODO
            title: 'Venting',
          },
        ]}
      />
    </VolumePanel>
  )
}
