'use client'

import { ModuleControlPage } from '@/components/module-page/module-control-page'
import { l4fbtConfig } from '@/lib/modules/l4fbt.config'

import { L4fBTP3Connector } from './parts/l4fbt-p3-connector'
import { L4fBTS1Connector } from './parts/l4fbt-s1-connector'
import { S3Volumes } from './parts/s3-volumes'

export default function L4fBTPage() {
  return (
    <ModuleControlPage
      config={l4fbtConfig}
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
