'use client'

import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()
  router.push('/p3-controls')
  return <div></div>
}
