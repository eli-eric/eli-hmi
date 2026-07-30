import { redirect } from 'next/navigation'

import { getHomeRoute } from '@/lib/settings/zone-service'

// The home route now comes from the runtime-mounted zone config — force a
// per-request evaluation instead of baking the redirect at build time.
export const dynamic = 'force-dynamic'

export default function Home() {
  redirect(getHomeRoute())
}
