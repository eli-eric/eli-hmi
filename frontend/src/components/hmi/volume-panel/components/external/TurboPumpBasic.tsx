import { FC } from 'react'

import { useWebSocketData } from '@/lib/websocket/use-websocket-data'
import { PVDisplay } from '@/lib/websocket/pv-display'
import {
  getFormattedValue,
  ValueFormatOptions,
} from '@/lib/utils/pv-helpers'

import { Container } from '../Container'
import { VolumeCard } from '../internal/VolumeCard'
import { VolumeTitle } from '../internal/VolumeTitle'
import { TextContent } from '../internal/TextContent'
import { WarningErrorControl } from '../WarningErrorControl'

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
 * Detailed turbopump readout: status + RPM + temperature, with optional warn/error.
 */
export const TurbopumpBasic: FC<TurbopumpBasicProps> = ({
  statusPV,
  rpmPV,
  tempPV,
  label,
  stateControl,
}) => {
  const options: ValueFormatOptions = { format: 'precision' }

  const { byPv, isConnected } = useWebSocketData<number | null>({
    pvs: [statusPV, rpmPV, tempPV],
  })

  const formatValue = (value: number) => getFormattedValue({ value, options })

  const getSpeedLabel = (value: number) => {
    if (value > 80) return 'Full Speed'
    if (value > 60) return 'High Speed'
    if (value > 40) return 'Medium Speed'
    if (value > 20) return 'Low Speed'
    if (value > 0) return 'Standby'
    return 'Off'
  }

  return (
    <Container>
      <VolumeTitle title={label} />
      <VolumeCard>
        <TextContent>
          <PVDisplay
            data={byPv(statusPV)}
            isConnected={isConnected}
            formatValue={getSpeedLabel}
          />
        </TextContent>
      </VolumeCard>
      {stateControl && <WarningErrorControl {...stateControl} />}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.5rem',
          alignSelf: 'stretch',
        }}
      >
        <VolumeCard>
          <TextContent>
            <PVDisplay
              data={byPv(rpmPV)}
              isConnected={isConnected}
              formatValue={formatValue}
            />
          </TextContent>
        </VolumeCard>
        <VolumeCard>
          <TextContent>
            <PVDisplay
              data={byPv(tempPV)}
              isConnected={isConnected}
              formatValue={formatValue}
            />
          </TextContent>
        </VolumeCard>
      </div>
    </Container>
  )
}
