'use client'

import { FC } from 'react'

import { ClearButton } from '@/components/ui/buttons'
import { useWebSocketData } from '@/lib/websocket/use-websocket-data'
import { getPrefixedPV } from '@/lib/utils/pv-helpers'
import { useRuntimeConfig } from '@/lib/runtime-config/context'

import commonStyles from '../styles/common.module.css'

interface WarningErrorControlProps {
  warningPv: string
  errorPv: string
  checkClearPv: string
}

/**
 * Warning / Error status derived from two binary PVs, with a Clear button
 * that POSTs to {@link checkClearPv} (write side keeps its prefix call).
 */
export const WarningErrorControl: FC<WarningErrorControlProps> = ({
  warningPv,
  checkClearPv,
  errorPv,
}) => {
  const { isConnected, byPv } = useWebSocketData<1 | 0 | null>({
    pvs: [warningPv, checkClearPv, errorPv],
  })
  const { apiUrl } = useRuntimeConfig()

  const warning = byPv(warningPv)?.value === 1 ? 'Yes' : 'No'
  const error = byPv(errorPv)?.value === 1 ? 'Yes' : 'No'

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
            fetch(`${apiUrl}/${getPrefixedPV(checkClearPv)}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ value: 1 }),
            })
          }}
        />
      </div>
    </div>
  )
}
