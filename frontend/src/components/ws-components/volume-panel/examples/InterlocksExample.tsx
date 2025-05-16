'use client'

import { VolumePanel } from '../'

/**
 * Example usage of the Interlocks component
 */
export const InterlocksExample = () => {
  return (
    <VolumePanel width="100%">
      <VolumePanel.Title label="System Interlocks" />
      <VolumePanel.Card>
        <VolumePanel.CardLabel>Safety Interlocks</VolumePanel.CardLabel>
        <VolumePanel.Interlocks>
          <VolumePanel.InterlockConnected
            pvname="BI_INTERLOCK_DOOR"
            title="Door Interlock"
          />
          <VolumePanel.InterlockConnected
            pvname="BI_INTERLOCK_PRESSURE"
            title="Pressure Interlock"
          />
          <VolumePanel.InterlockConnected
            pvname="BI_INTERLOCK_TEMPERATURE"
            title="Temperature Interlock"
          />
          <VolumePanel.InterlockConnected
            pvname="BI_INTERLOCK_EMERGENCY"
            title="Emergency Stop"
          />
        </VolumePanel.Interlocks>
      </VolumePanel.Card>
    </VolumePanel>
  )
}
