import { VolumePanel } from '@/app/ws-components/VolumePanel'

/**
 * Clean Dry Air component for L3BT controls
 * Displays clean dry air pressure information
 */
export const ClearDryAir = () => {
  return (
    <VolumePanel>
      <VolumePanel.Title label="L3BT Clean Dry Air" />
      <VolumePanel.Card>
        <VolumePanel.CardLabel>Pressure</VolumePanel.CardLabel>
        <VolumePanel.SensorPressureConnected
          pvname="AI_BAR_PP511"
          label="PP511"
          onDataUpdate={(msg) => {
            console.log('Clean Dry Air Data Update', msg)
          }}
        />
      </VolumePanel.Card>
    </VolumePanel>
  )
}
