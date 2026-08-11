import { loadModuleConfig } from '@/lib/modules/module-config-loader'

import { P3ControlsView } from './p3-controls-view'

export const dynamic = 'force-dynamic'

export default function P3ControlsPage() {
  const config = loadModuleConfig('p3')

  return <P3ControlsView config={config} />
}
