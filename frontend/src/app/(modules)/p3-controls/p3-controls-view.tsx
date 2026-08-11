'use client'

import { ModuleControlPage } from '@/components/module-page/module-control-page'
import type { ModuleConfig } from '@/lib/modules/types'

import { P3EGVConnector } from './parts/p3-egv-connector'
import { P3Volumes } from './parts/p3-volumes'

interface P3ControlsViewProps {
  config: ModuleConfig
}

export function P3ControlsView({ config }: P3ControlsViewProps) {
  return (
    <ModuleControlPage
      config={config}
      bottomRow={
        <>
          <P3EGVConnector />
          <P3Volumes />
        </>
      }
    />
  )
}
