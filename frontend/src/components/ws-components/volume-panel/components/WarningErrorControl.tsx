'use client'

import { FC } from 'react'
import { ClearButton } from '@/components/ui/buttons'
import { useWebSocketMulti } from '@/hooks/useWebSocketData'
import { getPrefixedPV } from '@/lib/utils/pv-helpers'
import { API_URL } from '@/types/constants'
import commonStyles from '../styles/common.module.css'

/**
 * Props for the WarningErrorControl component
 */
interface WarningErrorControlProps {
  /**
   * Array of PV names to monitor for warnings and errors
   */
  warningPv: string
  errorPv: string
  checkClearPv: string
}

/**
 * WarningErrorControl - Displays warning and error status
 *
 * Shows warning and error status based on PV values
 */
export const WarningErrorControl: FC<WarningErrorControlProps> = ({
  warningPv,
  checkClearPv,
  errorPv,
}) => {
  const { isConnected, state } = useWebSocketMulti<1 | 0 | null>({
    pvs: [
      getPrefixedPV(warningPv),
      getPrefixedPV(checkClearPv),
      getPrefixedPV(errorPv),
    ],
  })

  const warning = state[getPrefixedPV(warningPv)]?.value === 1 ? 'Yes' : 'No'
  const error = state[getPrefixedPV(errorPv)]?.value === 1 ? 'Yes' : 'No'

  return (
    <div className={commonStyles.warningContainer}>
      <div className={commonStyles.flexColumn}>
        <span className={commonStyles.textNormal}>{`Warning: ${
          isConnected ? warning : 'N/A'
        }`}</span>
        <span className={commonStyles.textNormal}>{`Error: ${
          isConnected ? error : 'N/A'
        }`}</span>
      </div>
      <div>
        <ClearButton
          disabled
          onClick={() => {
            fetch(`${API_URL}/${getPrefixedPV(checkClearPv)}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ value: 1 }),
            })
          }}
        />
      </div>
    </div>
  )
}
