import { Meter } from '@/app/ws-components/meter'

/**
 * Clean Dry Air component for L3BT controls
 * Displays clean dry air pressure information
 */
export const ClearDryAir = () => {
  return (
    <Meter>
      <Meter.Title label="L3BT Clean Dry Air" />
      <Meter.Card>
        <Meter.CardLabel>Pressure</Meter.CardLabel>
        <Meter.SensorPressureConnected
          pvname="AI_BAR_PP511"
          label="PP511"
          onDataUpdate={(msg) => {
            console.log('Clean Dry Air Data Update', msg)
          }}
        />
      </Meter.Card>
    </Meter>
  )
}
