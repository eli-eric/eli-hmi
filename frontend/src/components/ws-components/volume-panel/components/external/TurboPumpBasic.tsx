import { FC } from 'react'
import { Row } from '@/components/ui/layout'
import { Container } from '../Container'
import {
  getFormattedValue,
  getPrefixedPV,
  ValueFormatOptions,
} from '@/lib/utils/pv-helpers'
import { VolumeTitle } from '../internal/VolumeTitle'
import { WarningErrorControl } from '../WarningErrorControl'
import { VolumeCard } from '../internal/VolumeCard'
import { TextContent } from '../internal/TextContent'
import WithErrorData from '@/components/ws-components/with-error-data'
import { useWebSocketMulti } from '@/hooks/useWebSocketData'

/**
 * Props for the TurbopumpBasic component
 */
interface TurbopumpBasicProps {
  /** PV name for the turbopump status */
  statusPV: string
  /** PV name for the turbopump RPM reading */
  rpmPV: string
  /** PV name for the turbopump temperature reading */
  tempPV: string
  /** Display label for the turbopump */
  label: string
  /** Optional state control for warnings and errors */
  stateControl?: {
    /** PV name for warnings */
    warningPv: string
    /** PV name for errors */
    errorPv: string
    /** PV name for clearing warnings/errors */
    checkClearPv: string
  }
}

/**
 * TurbopumpBasic component
 *
 * Displays detailed turbopump monitoring information including status, RPM, and temperature.
 * This component provides a comprehensive view of a turbopump's operational state with
 * optional warning/error status reporting.
 *
 * The component automatically determines the speed status label based on the RPM percentage.
 *
 * @example
 * ```tsx
 * <TurbopumpBasic
 *   statusPV="TURBO_STATUS"
 *   rpmPV="TURBO_RPM"
 *   tempPV="TURBO_TEMP"
 *   label="Main Turbopump"
 *   stateControl={{
 *     warningPv: "TURBO_WARNING",
 *     errorPv: "TURBO_ERROR",
 *     checkClearPv: "TURBO_CLEAR"
 *   }}
 * />
 * ```
 */
export const TurbopumpBasic: FC<TurbopumpBasicProps> = ({
  statusPV: sPv,
  rpmPV: rPv,
  tempPV: tPv,
  label,
  stateControl,
}) => {
  const options: ValueFormatOptions = {
    format: 'precision',
  }

  const rpmPV = getPrefixedPV(rPv)
  const tempPV = getPrefixedPV(tPv)

  const { state, isConnected } = useWebSocketMulti<number | null>({
    pvs: [sPv, rpmPV, tempPV],
  })

  const formatValue = (value: number) => getFormattedValue({ value, options })

  /**
   * Determines the speed label based on the RPM percentage
   * @param value - The RPM percentage (0-100)
   * @returns A descriptive label for the current speed
   */
  const getSpeedLabel = (value: number) => {
    if (value > 80) return 'Full Speed'
    else if (value > 60) return 'High Speed'
    else if (value > 40) return 'Medium Speed'
    else if (value > 20) return 'Low Speed'
    else if (value > 0) return 'Standby'
    else return 'Off'
  }
  return (
    <Container>
      <VolumeTitle title={label} />
      <VolumeCard>
        <TextContent>
          <WithErrorData
            data={state[sPv]}
            isConnected={isConnected}
            formatValue={getSpeedLabel}
          />
        </TextContent>
      </VolumeCard>
      {stateControl && <WarningErrorControl {...stateControl} />}
      <Row>
        <VolumeCard>
          <TextContent>
            <WithErrorData
              data={state[rpmPV]}
              isConnected={isConnected}
              formatValue={formatValue}
            />
          </TextContent>
        </VolumeCard>
        <VolumeCard>
          <TextContent>
            <WithErrorData
              data={state[tempPV]}
              isConnected={isConnected}
              formatValue={formatValue}
            />
          </TextContent>
        </VolumeCard>
      </Row>
    </Container>
  )
}
