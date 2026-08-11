'use client'

import { ModuleControlPage } from '@/components/module-page/module-control-page'
import type { ModuleConfig } from '@/lib/modules/types'

import { L4fBTP3Connector } from './parts/l4fbt-p3-connector'
import { L4fBTS1Connector } from './parts/l4fbt-s1-connector'
import { S3Volumes } from './parts/s3-volumes'

interface L4fBTControlsViewProps {
  config: ModuleConfig
}

export function L4fBTControlsView({ config }: L4fBTControlsViewProps) {
  return (
    <ModuleControlPage
      config={config}
      bottomRow={
        <>
          <L4fBTS1Connector />
          <S3Volumes />
          <L4fBTP3Connector />
        </>
      }
    />
  )
}
