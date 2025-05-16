'use client'
import { VolumePanel } from '@/components/ws-components/volume-panel'

/**
 * L3BTMachineSafetyPermission component
 *
 * Displays the L3BT machine safety permissions using the refactored VolumePanel.Interlocks component
 */
export const L3BTMachineSafetyPermission = () => {
  return (
    <VolumePanel width="16rem">
      <VolumePanel.Title label="L3BT Machine Safety Permissions" />
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
