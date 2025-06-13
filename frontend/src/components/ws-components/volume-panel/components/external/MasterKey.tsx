import { Container } from '../Container'
import { VolumeCard } from '../internal/VolumeCard'
import { FC } from 'react'
import { getPrefixedPV } from '@/lib/utils/pv-helpers'
import { VolumeTitle } from '../internal/VolumeTitle'
import { useWebSocketMulti } from '@/hooks/useWebSocketData'
import { TextContent } from '../internal/TextContent'

interface MasterKeyProps {
  title: string
  pvName: string
}

/**
 * MasterKey component
 *
 *
 * Displays the state of the master key
 * - "Enabled" if the master key is on (value 1)
 * - "Blocked" if the master key is off (value 0)
 * - "Master Key state is unknown" if the value is null
 * * @param title - Title of the master key component
 * * @param pvName - Process variable name for the master key state
 * * @returns {JSX.Element} The rendered master key component
 *
 * This component uses WebSocket to fetch the state of the master key
 *  */
export const MasterKey: FC<MasterKeyProps> = ({ title, pvName }) => {
  const { state } = useWebSocketMulti<1 | 0 | null>({
    pvs: [getPrefixedPV(pvName)],
  })

  const value = state[getPrefixedPV(pvName)]?.value
  const isMasterKeyOn = value === 1
  const isMasterKeyOff = value === 0
  const content = isMasterKeyOn
    ? 'Enabled'
    : isMasterKeyOff
    ? 'Blocked'
    : 'Master Key state is unknown'

  return (
    <Container>
      <VolumeTitle title={title} />
      <VolumeCard>
        <TextContent>{content}</TextContent>
      </VolumeCard>
    </Container>
  )
}
