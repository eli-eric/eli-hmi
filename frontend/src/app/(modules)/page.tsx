'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function Home() {
  const router = useRouter()
  useEffect(() => {
    router.push('/p3-controls')
  }, [router])
  return <div></div>
}
