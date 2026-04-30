'use client'

import { ModuleControlPage } from '@/components/module-page/module-control-page'
import { l3btConfig } from '@/lib/modules/l3bt.config'

import { L3BTBisConnector } from './parts/l3bt-bis-connector'
import { L3BTEgvConnector } from './parts/l3bt-egv-connector'
import { L3BTSgvConnector } from './parts/l3bt-sgv-connector'
import { S1Volume } from './parts/s1-volume'
import { S3Volume } from './parts/s3-volume'

export default function L3btPage() {
  return (
    <ModuleControlPage
      config={l3btConfig}
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
