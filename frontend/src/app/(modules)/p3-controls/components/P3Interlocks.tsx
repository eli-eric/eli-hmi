'use client'
import { VolumePanel } from '@/components/ws-components/volume-panel'

/**
 * P3Interlocks component
 *
 * Displays the P3 interlocks using the refactored VolumePanel.Interlocks component
 */
export const P3Interlocks = () => {
  return (
    <VolumePanel
      width="16rem"
      title="P3 Interlocks"
      checkClearPv="E3-P3-P3_CHAMBER:INTERLOCK"
    >
      <VolumePanel.Interlocks
        interlocksPVs={[
          {
            pvname: 'E3-P3-P3_CHAMBER:INTERLOCK',
            title: 'P3 Chamber',
          },
          {
            pvname: 'E3-P3-CRYO1:INTERLOCK',
            title: 'P3 Cryopump CRYO1',
          },
          {
            pvname: 'E3-P3-CRYO2:INTERLOCK',
            title: 'P3 Cryopump CRYO2',
          },
          {
            pvname: 'BI_P3_Doors', // TODO
            title: 'P3 Doors',
          },
          {
            pvname: 'BI_P3_TMP801', // TODO
            title: 'P3 Turbopump TMP801',
          },
          {
            pvname: 'BI_P3_TMP802', // TODO
            title: 'P3 Turbopump TMP802',
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
