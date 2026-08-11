import { loadModuleConfig } from '@/lib/modules/module-config-loader'

import { L4fBTControlsView } from './l4fbt-controls-view'

export const dynamic = 'force-dynamic'

export default function L4fBTControlsPage() {
  const config = loadModuleConfig('l4fbt')

  return <L4fBTControlsView config={config} />
}
