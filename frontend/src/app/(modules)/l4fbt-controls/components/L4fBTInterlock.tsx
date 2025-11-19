'use client'
import { VolumePanel } from '@/components/ws-components/volume-panel'

/**
 * L4fBTInterlocks component
 *
 * Displays the L4fBT interlocks using the refactored VolumePanel.Interlocks component
 */

export const L4fBTInterlocks = () => {
  return (
    <VolumePanel
      width="16rem"
      title="L4fBT Interlocks"
      checkClearPv="undefinded:INTERLOCK" //Add PV
    >
      <VolumePanel.Interlocks
        interlocksPVs={[
          {
            pvname: 'undefinded:INTERLOCK', //Add PV
            title: 'L4fBT S3 Volume',
          },
          {
            pvname: 'undefinded:INTERLOCK', //Add PV
            title: 'Valve EGV802',
          },
        ]}
      />
    </VolumePanel>
  )
}
