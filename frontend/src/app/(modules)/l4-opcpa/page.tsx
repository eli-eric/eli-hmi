import { loadLaserSpecs } from './config/load-laser-specs'
import { L4OpcpaView } from './components/l4-opcpa-view'

/**
 * Server shell for the L4 OPCPA page. Reads + validates the per-laser config
 * referenced by the current zone (runtime-mounted config dir, see CSI-861)
 * and hands the resolved specs to the client view. `force-dynamic` so the
 * config is read from the running container, not baked in at `next build`;
 * an invalid config fails at container start (instrumentation.ts) or renders
 * error.tsx.
 */
export const dynamic = 'force-dynamic'

export default function L4OpcpaPage() {
  const specs = loadLaserSpecs()
  return <L4OpcpaView specs={specs} />
}
