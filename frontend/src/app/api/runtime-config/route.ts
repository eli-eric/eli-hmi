import { NextResponse } from 'next/server'

// Forces a fresh process.env read on every request in the running container
// instead of Next.js statically evaluating/caching this route at build time.
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(
    {
      apiUrl: process.env.API_URL ?? null,
      apiScheme: process.env.API_SCHEME ?? null,
      zoneCode: process.env.ZONE_CODE ?? null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
