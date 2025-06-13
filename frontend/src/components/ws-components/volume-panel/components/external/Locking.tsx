import { FC } from 'react'
import { Container } from '../Container'
import { VolumeTitle } from '../internal/VolumeTitle'
import { useWebSocketMulti } from '@/hooks/useWebSocketData'
import { TextContent } from '../internal/TextContent'
import WithErrorData from '@/components/ws-components/with-error-data'
import { getPrefixedPV } from '@/lib/utils/pv-helpers'
import { VolumeCard } from '../internal/VolumeCard'

interface LockingProps {
  label: string
  pvName: string
}

export const Locking: FC<LockingProps> = ({ label, pvName: pv }) => {
  const pvName = getPrefixedPV(pv)
  const { state, isConnected } = useWebSocketMulti({
    pvs: [pvName],
  })
  return (
    <Container>
      <VolumeTitle title={label} />
      <VolumeCard>
        <TextContent>
          <WithErrorData data={state[pvName]} isConnected={isConnected} />
        </TextContent>
      </VolumeCard>
    </Container>
  )
}
