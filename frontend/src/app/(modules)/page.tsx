import { redirect } from 'next/navigation'

import { getDefaultRoute } from '@/lib/settings/zone-service'

export default function Home() {
  redirect(getDefaultRoute() ?? '/no-access')
}
