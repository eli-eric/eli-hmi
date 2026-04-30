import { FC } from 'react'

import { useWebSocketData } from '@/lib/websocket/use-websocket-data'

import { Container } from '../Container'
import { VolumeCard } from '../internal/VolumeCard'
import { VolumeTitle } from '../internal/VolumeTitle'
import { TextContent } from '../internal/TextContent'

interface MasterKeyProps {
  title: string
  pvName: string
}

/**
 * Master-key access state: Enabled / Blocked / unknown.
 */
export const MasterKey: FC<MasterKeyProps> = ({ title, pvName }) => {
  const { data, isConnected } = useWebSocketData<1 | 0 | null>(pvName)

  const value = data?.value
  const content =
    value === 1
      ? 'Enabled'
      : value === 0
        ? 'Blocked'
        : 'Master Key state is unknown'

  return (
    <Container>
      <VolumeTitle title={title} />
      <VolumeCard>
        <TextContent>{isConnected ? content : 'N/A'}</TextContent>
      </VolumeCard>
    </Container>
  )
}
