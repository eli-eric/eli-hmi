import { redirect } from 'next/navigation'

import { getHomeRoute } from '@/lib/settings/zone-service'

// The home route comes from the zone config, selected by ZONE_CODE — force a
// per-request evaluation instead of baking the redirect at build time.
export const dynamic = 'force-dynamic'

export default function Home() {
  redirect(getHomeRoute())
}
