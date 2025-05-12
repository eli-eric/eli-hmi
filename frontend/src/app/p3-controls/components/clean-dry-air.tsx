import { Meter } from '@/app/ws-components/meter'

export const ClearDryAir = () => {
  return (
    <Meter>
      <Meter.Title label="L3BT Clean Dry Air" />
      <Meter.Card>
        <Meter.CardLabel>Pressure</Meter.CardLabel>
        <Meter.SensorPressurePV pvname="AI_BAR_PPS801" label="PPS801" />
      </Meter.Card>
    </Meter>
  )
}
