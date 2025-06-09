import { FC } from 'react'
import { withReactWebSocketData } from '../../with-websocket-data'
import { Container } from './Container'
import { PumpSpeed, ValveStatus } from './SensorComponents'
import { VolumeLabel } from './VolumeLabel'
import { getPrefixedPV } from '@/lib/utils/pv-helpers'

const PumpSpeedConnected = withReactWebSocketData(PumpSpeed)
const ValveStatusConnected = withReactWebSocketData(ValveStatus)

interface TurbopumpBasicProps {
  valvePv: string
  rpmPV: string
  valveLabel: string
  label: string
}

/**
 * TurbopumpBasic component
 *
 * Displays turbopump data including status, RPM and temperature
 * Uses prefixed PV names for development environment to ensure proper mock server data types
 */
export const Pump: FC<TurbopumpBasicProps> = ({
  rpmPV,
  valvePv,
  label,
  valveLabel,
}) => {
  return (
    <Container>
      <VolumeLabel label={label} />
      <PumpSpeedConnected
        pvname={getPrefixedPV(rpmPV)}
        options={{ format: 'precision' }}
      />
      <ValveStatusConnected
        pvname={getPrefixedPV(valvePv)}
        label={valveLabel}
      />
    </Container>
  )
}
