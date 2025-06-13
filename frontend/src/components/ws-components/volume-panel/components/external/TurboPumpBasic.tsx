import { FC } from 'react'
import { Row } from '@/components/ui/layout'
import { Container } from '../Container'
import {
  getFormattedValue,
  getPrefixedPV,
  ValueFormatOptions,
} from '@/lib/utils/pv-helpers'
import { VolumeTitle } from '../internal/VolumeTitle'
import { WarningErrorControl } from '../WarningErrorControl'
import { VolumeCard } from '../internal/VolumeCard'
import { TextContent } from '../internal/TextContent'
import WithErrorData from '@/components/ws-components/with-error-data'
import { useWebSocketMulti } from '@/hooks/useWebSocketData'

interface TurbopumpBasicProps {
  statusPV: string
  rpmPV: string
  tempPV: string
  label: string
  stateControl?: {
    warningPv: string
    errorPv: string
    checkClearPv: string
  }
}

/**
 * TurbopumpBasic component
 *
 * Displays turbopump data including status, RPM and temperature
 * Uses prefixed PV names for development environment to ensure proper mock server data types
 */
export const TurbopumpBasic: FC<TurbopumpBasicProps> = ({
  statusPV: sPv,
  rpmPV: rPv,
  tempPV: tPv,
  label,
  stateControl,
}) => {
  const options: ValueFormatOptions = {
    format: 'precision',
  }

  const rpmPV = getPrefixedPV(rPv)
  const tempPV = getPrefixedPV(tPv)

  const { state, isConnected } = useWebSocketMulti<number | null>({
    pvs: [sPv, rpmPV, tempPV],
  })

  const formatValue = (value: number) => getFormattedValue({ value, options })

  const getSpeedLabel = (value: number) => {
    if (value > 80) return 'Full Speed'
    else if (value > 60) return 'High Speed'
    else if (value > 40) return 'Medium Speed'
    else if (value > 20) return 'Low Speed'
    else if (value > 0) return 'Standby'
    else return 'Off'
  }
  return (
    <Container>
      <VolumeTitle title={label} />
      <VolumeCard>
        <TextContent>
          <WithErrorData
            data={state[sPv]}
            isConnected={isConnected}
            formatValue={getSpeedLabel}
          />
        </TextContent>
      </VolumeCard>
      {stateControl && <WarningErrorControl {...stateControl} />}
      <Row>
        <VolumeCard>
          <TextContent>
            <WithErrorData
              data={state[rpmPV]}
              isConnected={isConnected}
              formatValue={formatValue}
            />
          </TextContent>
        </VolumeCard>
        <VolumeCard>
          <TextContent>
            <WithErrorData
              data={state[tempPV]}
              isConnected={isConnected}
              formatValue={formatValue}
            />
          </TextContent>
        </VolumeCard>
      </Row>
    </Container>
  )
}
