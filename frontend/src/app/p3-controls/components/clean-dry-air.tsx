import { VolumePanel } from '@/app/ws-components/volume-panel'

/**
 * Clean Dry Air component for P3 controls
 * Displays clean dry air pressure information
 */
export const ClearDryAir = () => {
  return (
    <VolumePanel>
      <VolumePanel.Title label="P3 Clean Dry Air" />
      <VolumePanel.Card>
        <VolumePanel.CardLabel>Pressure</VolumePanel.CardLabel>
        <VolumePanel.SensorPressureConnected
          pvname="AI_BAR_PPS801"
          label="PPS801"
        />
      </VolumePanel.Card>
    </VolumePanel>
  )
}
