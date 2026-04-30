import { FC } from 'react'

import { useWebSocketData } from '@/lib/websocket/use-websocket-data'
import { PVDisplay } from '@/lib/websocket/pv-display'

import { Container } from '../Container'
import { VolumeCard } from '../internal/VolumeCard'
import { VolumeTitle } from '../internal/VolumeTitle'
import { TextContent } from '../internal/TextContent'

interface LockingProps {
  label: string
  pvName: string
}

/**
 * Locking status readout backed by a single PV.
 */
export const Locking: FC<LockingProps> = ({ label, pvName }) => {
  const { data, isConnected } = useWebSocketData(pvName)
  return (
    <Container>
      <VolumeTitle title={label} />
      <VolumeCard>
        <TextContent>
          <PVDisplay data={data} isConnected={isConnected} />
        </TextContent>
      </VolumeCard>
    </Container>
  )
}
