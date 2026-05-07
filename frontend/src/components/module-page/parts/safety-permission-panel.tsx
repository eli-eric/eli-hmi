import { FC } from 'react'

import { InterlocksPanel } from './interlocks-panel'

import type { InterlockGroupConfig } from '@/lib/modules/types'

/**
 * Safety-permission panel. Same shape and rendering as Interlocks today, but
 * kept as a separate symbol so the two divergence paths (different icon set,
 * different title style, different interactions) can land in one place
 * without touching every page that uses it.
 */
export const SafetyPermissionPanel: FC<{ config: InterlockGroupConfig }> = ({
  config,
}) => <InterlocksPanel config={config} />
