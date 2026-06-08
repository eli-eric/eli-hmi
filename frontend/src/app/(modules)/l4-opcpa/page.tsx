import { loadLaserSpecs } from './config/load-laser-specs'
import { L4OpcpaView } from './components/l4-opcpa-view'

/**
 * Server shell for the L4 OPCPA page. Reads + validates the per-laser config
 * from `lasers.yaml` (server-only) and hands the resolved specs to the client
 * view. No dynamic APIs → Next prerenders this statically, so config parsing /
 * validation happens at `next build`; an invalid config fails the build.
 */
export default function L4OpcpaPage() {
  const specs = loadLaserSpecs()
  return <L4OpcpaView specs={specs} />
}
