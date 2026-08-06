import { loadModuleConfig } from '@/lib/modules/module-config-loader'

import { L3BTControlsView } from './l3bt-controls-view'

export const dynamic = 'force-dynamic'

export default function L3BTControlsPage() {
  const config = loadModuleConfig('l3bt')

  return <L3BTControlsView config={config} />
}
