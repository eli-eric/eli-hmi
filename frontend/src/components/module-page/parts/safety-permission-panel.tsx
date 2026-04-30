import { FC } from 'react'

import { InterlocksPanel } from './interlocks-panel'

import type { InterlockGroupConfig } from '@/lib/modules/types'

/**
 * Machine-safety-permission panel. Same shape as Interlocks; delegates rendering.
 * Kept as a separate export so configs can use distinct names.
 */
export const SafetyPermissionPanel: FC<{ config: InterlockGroupConfig }> = ({
  config,
}) => {
  return <InterlocksPanel config={config} />
}
