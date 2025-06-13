import { FC } from 'react'
import { Container } from '../Container'
import { getPrefixedPV } from '@/lib/utils/pv-helpers'
import { VolumeTitle } from '../internal/VolumeTitle'
import { ValveStatus } from '../internal/ValveStatus'
import { VolumeCard } from '../internal/VolumeCard'
import WithErrorData from '@/components/ws-components/with-error-data'
import { useWebSocketMulti } from '@/hooks/useWebSocketData'
import { Message } from '@/app/providers/types'
import { TextContent } from '../internal/TextContent'

interface TurbopumpBasicProps {
  valvePv: string
  rpmPV: string
  valveLabel: string
  title: string
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
  title,
  valveLabel,
}) => {
  const { state, isConnected } = useWebSocketMulti({
    pvs: [getPrefixedPV(rpmPV), getPrefixedPV(valvePv)],
  })
  console.log('Pump state:', state)
  return (
    <Container>
      <VolumeTitle title={title} />
      <VolumeCard>
        <TextContent>
          <WithErrorData
            data={state[getPrefixedPV(rpmPV)]}
            isConnected={isConnected}
          />
        </TextContent>
      </VolumeCard>
      <ValveStatus
        data={state[getPrefixedPV(valvePv)] as Message<1 | 0 | null>}
        label={valveLabel}
        isConnected={isConnected}
      />
    </Container>
  )
}
