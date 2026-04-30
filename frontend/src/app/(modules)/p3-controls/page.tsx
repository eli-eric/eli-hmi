'use client'

import { ModuleControlPage } from '@/components/module-page/module-control-page'
import { p3Config } from '@/lib/modules/p3.config'

import { P3EGVConnector } from './parts/p3-egv-connector'
import { P3Volumes } from './parts/p3-volumes'

export default function P3ControlsPage() {
  return (
    <ModuleControlPage
      config={p3Config}
      bottomRow={
        <>
          <P3EGVConnector />
          <P3Volumes />
        </>
      }
    />
  )
}
