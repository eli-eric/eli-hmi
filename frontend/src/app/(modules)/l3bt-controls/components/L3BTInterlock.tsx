'use client'
import { VolumePanel } from '@/components/ws-components/volume-panel'

/**
 * L3BTInterlocks component
 *
 * Displays the L3BT interlocks using the refactored VolumePanel.Interlocks component
 */

export const L3BTInterlocks = () => {
  return (
    <VolumePanel
      width="16rem"
      title="L3BT Interlocks"
      checkClearPv="L3BT-VCS-S1:INTERLOCK"
    >
      <VolumePanel.Interlocks
        interlocksPVs={[
          {
            pvname: 'L3BT-VCS-S1:INTERLOCK',
            title: 'L3BT S1 Volume',
          },
          {
            pvname: 'L3BT-VCS-S3:INTERLOCK',
            title: 'L3BT S3 Volume',
          },
          {
            pvname: 'L3BT-VCS-SGV503:INTERLOCK',
            title: 'Safety Valve SGV503',
          },
          {
            pvname: 'L3BT-VCS-EGV501:INTERLOCK',
            title: 'Endstation Valve EGV501',
          },
        ]}
      />
    </VolumePanel>
  )
}
