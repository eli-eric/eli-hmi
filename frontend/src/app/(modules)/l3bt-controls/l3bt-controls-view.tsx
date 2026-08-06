'use client'

import { ModuleControlPage } from '@/components/module-page/module-control-page'
import type { ModuleConfig } from '@/lib/modules/types'

import { L3BTBisConnector } from './parts/l3bt-bis-connector'
import { L3BTEgvConnector } from './parts/l3bt-egv-connector'
import { L3BTSgvConnector } from './parts/l3bt-sgv-connector'
import { S1Volume } from './parts/s1-volume'
import { S3Volume } from './parts/s3-volume'

interface L3BTControlsViewProps {
  config: ModuleConfig
}

export function L3BTControlsView({ config }: L3BTControlsViewProps) {
  return (
    <ModuleControlPage
      config={config}
      bottomRow={
        <>
          <L3BTBisConnector />
          <S1Volume />
          <L3BTSgvConnector />
          <S3Volume />
          <L3BTEgvConnector />
        </>
      }
    />
  )
}
