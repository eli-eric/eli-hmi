import { FC } from 'react'
import { Row } from '@/components/ui/layout'
import { withReactWebSocketData } from '../../with-websocket-data'
import { Container } from './Container'
import { PumpSpeed, ValueUnit } from './SensorComponents'
import { VolumeLabel } from './VolumeLabel'
import { getPrefixedPV, ValueFormatOptions } from '@/lib/utils/pv-helpers'

const PumpSpeedConnected = withReactWebSocketData(PumpSpeed)
const ValueUnitConnected = withReactWebSocketData(ValueUnit)

interface TurbopumpBasicProps {
  statusPV: string
  rpmPV: string
  tempPV: string
  label: string
}

/**
 * TurbopumpBasic component
 *
 * Displays turbopump data including status, RPM and temperature
 * Uses prefixed PV names for development environment to ensure proper mock server data types
 */
export const TurbopumpBasic: FC<TurbopumpBasicProps> = ({
  statusPV,
  rpmPV,
  tempPV,
  label,
}) => {
  const options: ValueFormatOptions = {
    format: 'exponencial',
  }
  return (
    <Container>
      <VolumeLabel label={label} />
      <PumpSpeedConnected pvname={getPrefixedPV(statusPV)} />
      <Row>
        <ValueUnitConnected pvname={getPrefixedPV(rpmPV)} options={options} />
        <ValueUnitConnected pvname={getPrefixedPV(tempPV)} options={options} />
      </Row>
    </Container>
  )
}
