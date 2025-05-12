import { Meter } from '@/app/ws-components/meter'

/**
 * Clean Dry Air component for P3 controls
 * Displays clean dry air pressure information
 */
export const ClearDryAir = () => {
  return (
    <Meter>
      <Meter.Title label="L3BT Clean Dry Air" />
      <Meter.Card>
        <Meter.CardLabel>Pressure</Meter.CardLabel>
        <Meter.SensorPressureConnected pvname="AI_BAR_PPS801" label="PP511" />
      </Meter.Card>
    </Meter>
  )
}
