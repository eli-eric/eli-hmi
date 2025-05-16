'use client'

import { VolumePanel } from '@/components/ws-components/volume-panel'

/**
 * P3MachineSafetyPermission component
 *
 * Displays the P3 machine safety permissions using the refactored VolumePanel.Interlocks component
 */
export const P3MachineSafetyPermission = () => {
  return (
    <VolumePanel width="16rem">
      <VolumePanel.Title label="P3 Machine Safety Permissions" />
      <VolumePanel.Card height="20rem">
        <VolumePanel.Interlocks>
          <VolumePanel.InterlockConnected
            pvname="BI_L3BT_Roughing"
            title="Roughing"
          />
          <VolumePanel.InterlockConnected
            pvname="BI_L3BT_High_Vacuum_Pumping"
            title="High Vacuum Pumping"
          />
          <VolumePanel.InterlockConnected
            pvname="BI_L3BT_Venting"
            title="Venting"
          />
        </VolumePanel.Interlocks>
      </VolumePanel.Card>
    </VolumePanel>
  )
}
