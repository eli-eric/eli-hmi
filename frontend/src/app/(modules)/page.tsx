import { redirect } from 'next/navigation'

import { getHomeRoute } from '@/lib/settings/zone-service'

export default function Home() {
  redirect(getHomeRoute())
}
