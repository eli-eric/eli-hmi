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
            title: 'P3 Chamber Roughing',
          },
          {
            pvname: 'L3BT_HIGH_VACUUM:INTERLOCK', // TODO
            title: 'P3 Chamber High Vacuum Pumping',
          },
          {
            pvname: 'E3-P3-CRYO1_Cooling:INTERLOCK', //Add PV
            title: 'P3 Cryopump CRYO1 Cooling',
          },
          {
            pvname: 'E3-P3-CRYO2_Cooling:INTERLOCK', //Add PV
            title: 'P3 Cryopump CRYO2 Cooling',
          },
          {
            pvname: 'L3BT-VCS-EGV501_TOOPEN:INTERLOCK', //Add PV
            title: 'Valve EGV501 to Open',
          },
          {
            pvname: 'L3BT-VCS-EGV501_TOOPEN:INTERLOCK', //Add PV
            title: 'Valve SGV503 to Open',
          },
        ]}
      />
    </VolumePanel>
  )
}
