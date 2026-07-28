import { RuntimeConfig } from './types'

// Plain (non-React) module so that non-component call sites — e.g. pvs.ts's
// apiBase(), invoked from plain async functions rather than hooks — can read
// the fetched config synchronously without depending on React context.
let cached: RuntimeConfig | null = null
let pending: Promise<RuntimeConfig> | null = null

export function getRuntimeConfig(): RuntimeConfig | null {
  return cached
}

export function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (cached) return Promise.resolve(cached)
  if (!pending) {
    pending = fetch('/api/runtime-config')
      .then((res) => res.json() as Promise<RuntimeConfig>)
      .then((data) => {
        cached = data
        return data
      })
      .catch((error) => {
        pending = null
        throw error
      })
  }
  return pending
}
