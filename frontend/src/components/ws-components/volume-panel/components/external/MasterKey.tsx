import { Container } from '../Container'
import { VolumeCard } from '../internal/VolumeCard'
import { FC } from 'react'
import { getPrefixedPV } from '@/lib/utils/pv-helpers'
import { VolumeTitle } from '../internal/VolumeTitle'
import { useWebSocketMulti } from '@/hooks/useWebSocketData'
import { TextContent } from '../internal/TextContent'

/**
 * Props for the MasterKey component
 */
interface MasterKeyProps {
  /** Title for the master key section */
  title: string
  /** PV name for the master key status */
  pvName: string
}

/**
 * MasterKey component
 *
 * Displays and controls the master key system access state.
 * This component monitors a process variable that indicates whether
 * the master key is active, showing different status text based on the value:
 *
 * - "Enabled" when master key is on (value = 1)
 * - "Blocked" when master key is off (value = 0)
 * - "Master Key state is unknown" when value is null or undefined
 *
 * The master key typically serves as a high-level override or access control
 * for critical system functions.
 *
 * @example
 * ```tsx
 * <MasterKey
 *   title="System Access"
 *   pvName="MASTER_KEY_STATUS"
 * />
 * ```
 */
export const MasterKey: FC<MasterKeyProps> = ({ title, pvName }) => {
  const { state, isConnected } = useWebSocketMulti<1 | 0 | null>({
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
        <TextContent>{isConnected ? content : 'N/A'}</TextContent>
      </VolumeCard>
    </Container>
  )
}
