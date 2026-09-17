import { loadLaserSpecs } from './config/load-laser-specs'
import { L4OpcpaView } from './components/l4-opcpa-view'

/**
 * Server shell for the L4 OPCPA page. Reads + validates the per-laser config
 * for the current zone (`config/zones/<ZONE_CODE>.yaml`, see ADR-0012)
 * and hands the resolved specs to the client view. `force-dynamic` because
 * which file to read depends on `ZONE_CODE`, which is only known at run time —
 * prerendering would pin one zone and break "one image for every station".
 * Invalid config fails the build (`validate:config` runs as `prebuild`), so
 * what reaches a container is already valid.
 */
export const dynamic = 'force-dynamic'

export default function L4OpcpaPage() {
  const specs = loadLaserSpecs()
  return <L4OpcpaView specs={specs} />
}
