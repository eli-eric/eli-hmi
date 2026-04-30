import { FC } from 'react'

import { useWebSocketData } from '@/lib/websocket/use-websocket-data'
import { PVDisplay } from '@/lib/websocket/pv-display'
import { Message } from '@/app/providers/types'

import { Container } from '../Container'
import { VolumeCard } from '../internal/VolumeCard'
import { VolumeTitle } from '../internal/VolumeTitle'
import { ValveStatus } from '../internal/ValveStatus'
import { TextContent } from '../internal/TextContent'

interface PumpProps {
  valvePv: string
  rpmPV: string
  valveLabel: string
  title: string
}

/**
 * Pump status: RPM reading + isolation valve status.
 */
export const Pump: FC<PumpProps> = ({ rpmPV, valvePv, title, valveLabel }) => {
  const { byPv, isConnected } = useWebSocketData({
    pvs: [rpmPV, valvePv],
  })

  return (
    <Container>
      <VolumeTitle title={title} />
      <VolumeCard>
        <TextContent>
          <PVDisplay data={byPv(rpmPV)} isConnected={isConnected} />
        </TextContent>
      </VolumeCard>
      <ValveStatus
        data={byPv(valvePv) as Message<1 | 0 | null>}
        label={valveLabel}
        isConnected={isConnected}
      />
    </Container>
  )
}
