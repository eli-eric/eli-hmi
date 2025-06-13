import { Container } from '../Container'
import { FC } from 'react'
import { getPrefixedPV } from '@/lib/utils/pv-helpers'
import { VolumeTitle } from '../internal/VolumeTitle'
import { DropDownStateControl } from '../internal/DropDownStateControl'

/**
 * Props for the Config component
 */
interface ConfigProps {
  /** Optional state control configuration */
  stateControl?: {
    /** PV name for the current configuration state */
    pvCurrentState: string
    /** PV name for the target configuration state */
    pvTargetState: string
    /** Array of control options for the configuration */
    controlPvs: {
      /** PV name to activate when this option is selected */
      pvName: string
      /** Display label for this option */
      label: string
    }[]
  }
  /** Title for the configuration section */
  title: string
}

/**
 * Config component
 *
 * Provides a configuration panel with a dropdown for selecting system parameters.
 * This component allows users to view and change system configuration settings
 * through a dropdown interface.
 *
 * @example
 * ```tsx
 * <Config
 *   title="System Configuration"
 *   stateControl={{
 *     pvCurrentState: "CONFIG_CURRENT",
 *     pvTargetState: "CONFIG_TARGET",
 *     controlPvs: [
 *       { pvName: "CONFIG_OPTION_1", label: "Low Pressure Mode" },
 *       { pvName: "CONFIG_OPTION_2", label: "High Pressure Mode" }
 *     ]
 *   }}
 * />
 * ```
 */
export const Config: FC<ConfigProps> = ({ title, stateControl }) => {
  return (
    <Container>
      <VolumeTitle title={title} />
      {stateControl && (
        <DropDownStateControl
          {...{
            controlPvs: stateControl.controlPvs.map((pv) => ({
              pvName: getPrefixedPV(pv.pvName),
              label: pv.label,
            })),
            pvNameCurrent: getPrefixedPV(stateControl.pvCurrentState),
            pvNameTarget: getPrefixedPV(stateControl.pvTargetState),
          }}
        />
      )}
    </Container>
  )
}
