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

/**
 * Props for the Pump component
 */
interface PumpProps {
  /** PV name for the valve status */
  valvePv: string
  /** PV name for the pump RPM reading */
  rpmPV: string
  /** Display label for the valve */
  valveLabel: string
  /** Title for the pump section */
  title: string
}

/**
 * Pump component
 *
 * Displays pump status information including RPM readings and valve status.
 * This component monitors real-time data from process variables and displays
 * the current state of a pump system.
 *
 * @example
 * ```tsx
 * <Pump
 *   title="Roughing Pump"
 *   rpmPV="PUMP_RPM"
 *   valvePv="VALVE_STATUS"
 *   valveLabel="Isolation Valve"
 * />
 * ```
 */
export const Pump: FC<PumpProps> = ({ rpmPV, valvePv, title, valveLabel }) => {
  const { state, isConnected } = useWebSocketMulti({
    pvs: [getPrefixedPV(rpmPV), getPrefixedPV(valvePv)],
  })

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
