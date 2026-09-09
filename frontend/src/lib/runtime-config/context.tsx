'use client'

import { createContext, useContext, useEffect, useState } from 'react'

import { buildApiUrl, buildWsUrl } from '@/types/constants'
import type { NavigationItem } from '@/lib/settings/navigation'
import { loadRuntimeConfig } from './client'

type RuntimeConfigStatus = 'loading' | 'ready' | 'error'

interface RuntimeConfigContextValue {
  status: RuntimeConfigStatus
  apiUrl: string
  wsUrl: string
  zoneCode?: string
  /** Zone nav items; empty until status === 'ready'. */
  navigationItems: NavigationItem[]
  /** Zone home route; null until status === 'ready'. */
  homeRoute: string | null
  /** Header name; null until status === 'ready', so nothing wrong is shown. */
  title: string | null
}

const RuntimeConfigContext = createContext<RuntimeConfigContextValue | null>(
  null,
)

export function RuntimeConfigProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [value, setValue] = useState<RuntimeConfigContextValue>({
    status: 'loading',
    apiUrl: buildApiUrl(null, null),
    wsUrl: buildWsUrl(null, null),
    navigationItems: [],
    homeRoute: null,
    title: null,
  })

  useEffect(() => {
    let cancelled = false
    loadRuntimeConfig()
      .then((config) => {
        if (cancelled) return
        setValue({
          status: 'ready',
          apiUrl: buildApiUrl(config.apiUrl, config.apiScheme),
          wsUrl: buildWsUrl(config.apiUrl, config.apiScheme),
          zoneCode: config.zoneCode ?? undefined,
          navigationItems: config.navigationItems ?? [],
          homeRoute: config.homeRoute ?? null,
          title: config.title ?? null,
        })
      })
      .catch(() => {
        if (cancelled) return
        setValue((prev) => ({ ...prev, status: 'error' }))
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <RuntimeConfigContext.Provider value={value}>
      {children}
    </RuntimeConfigContext.Provider>
  )
}

export function useRuntimeConfig(): RuntimeConfigContextValue {
  const context = useContext(RuntimeConfigContext)
  if (!context) {
    throw new Error(
      'useRuntimeConfig must be used within a RuntimeConfigProvider',
    )
  }
  return context
}
