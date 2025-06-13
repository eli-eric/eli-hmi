import { FC } from 'react'
import { Container } from '../Container'
import { VolumeTitle } from '../internal/VolumeTitle'
import { useWebSocketMulti } from '@/hooks/useWebSocketData'
import { TextContent } from '../internal/TextContent'
import WithErrorData from '@/components/ws-components/with-error-data'
import { getPrefixedPV } from '@/lib/utils/pv-helpers'
import { VolumeCard } from '../internal/VolumeCard'

/**
 * Props for the Locking component
 */
interface LockingProps {
  /** Display label for the locking control */
  label: string
  /** PV name for the locking status/control */
  pvName: string
}

/**
 * Locking component
 *
 * Displays locking status and controls for system components.
 * Monitors the lock state and displays the current status.
 *
 * @example
 * ```tsx
 * <Locking
 *   label="Access Control"
 *   pvName="SYSTEM_LOCK"
 * />
 * ```
 */
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
