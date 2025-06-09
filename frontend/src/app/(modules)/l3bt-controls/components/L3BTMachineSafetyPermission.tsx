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
            pvname={'L3BT-MSS:S1_ROUGHING_PERMISSION'}
            title="S1 Roughing"
          />
          <VolumePanel.InterlockConnected
            pvname={'L3BT-MSS:S1_HIGH_VAC_PERMISSION'}
            title="S1 high vacuum pumping"
          />
          <VolumePanel.InterlockConnected
            pvname={'L3BT-MSS:S3_ROUGHING_PERMISSION'}
            title="S3 roughing"
          />
          <VolumePanel.InterlockConnected
            pvname={'L3BT-MSS:S3_HIGH_VAC_PERMISSION'}
            title="S3 high vacuum pumping"
          />
        </VolumePanel.Interlocks>
      </VolumePanel.Card>
    </VolumePanel>
  )
}
