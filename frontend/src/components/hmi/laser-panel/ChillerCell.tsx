'use client'

import { FC } from 'react'
import type { Message } from '@/app/providers/types'
import {
  deriveCellState,
  type Limits,
} from './chiller-cell-state'
import styles from './sections.module.css'

interface ChillerCellProps {
  msg: Message<number | null> | undefined
  isConnected: boolean
  limits?: Limits
  deviceOff?: boolean
  precision?: number
}

/**
 * One Flow/Temp/Water cell. Delegates all decision-making to
 * {@link deriveCellState} (CSI-783) and renders text + tone + tooltip. The
 * `data-tone` attribute drives the colour (see sections.module.css
 * `.cellState[data-tone=...]`).
 */
export const ChillerCell: FC<ChillerCellProps> = ({
  msg,
  isConnected,
  limits,
  deviceOff,
  precision = 3,
}) => {
  const view = deriveCellState({ msg, isConnected, limits, deviceOff, precision })
  return (
    <span
      className={styles.cellState}
      data-tone={view.tone}
      data-kind={view.kind}
      title={view.title}
    >
      {view.text}
    </span>
  )
}
