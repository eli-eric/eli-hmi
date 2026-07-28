'use client'

import { createContext, useContext, useEffect, useState } from 'react'

import { buildApiUrl, buildWsUrl } from '@/types/constants'
import { loadRuntimeConfig } from './client'

type RuntimeConfigStatus = 'loading' | 'ready' | 'error'

interface RuntimeConfigContextValue {
  status: RuntimeConfigStatus
  apiUrl: string
  wsUrl: string
  zoneCode?: string
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
