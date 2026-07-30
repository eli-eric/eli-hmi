import { NextResponse } from 'next/server'

import {
  getHomeRoute,
  getNavigationItems,
} from '@/lib/settings/zone-service'

// Forces a fresh process.env read on every request in the running container
// instead of Next.js statically evaluating/caching this route at build time.
export const dynamic = 'force-dynamic'

export async function GET() {
  // Zone data is resolved here (server-side, from the mounted config dir)
  // because client components cannot fs-read the zone file themselves.
  return NextResponse.json(
    {
      apiUrl: process.env.API_URL ?? null,
      apiScheme: process.env.API_SCHEME ?? null,
      zoneCode: process.env.ZONE_CODE ?? null,
      navigationItems: getNavigationItems(),
      homeRoute: getHomeRoute(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
