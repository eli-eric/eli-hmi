/**
 * Single write entry point: every action in the UI is a PV write.
 *
 * `pvName` is the canonical PV identifier (e.g. `BI_NL2_SHUTTER`,
 * `AI_NL2_ATT`, `CMD_NL2_START_LASER`). Command PVs (prefix `CMD_`) trigger
 * coordinated effect chains on the backend; plain PVs are direct writes.
 */

import { getSession } from 'next-auth/react'

// Resolved lazily so vitest's beforeEach `stubEnv` takes effect (constants.ts
// captures the env at module-import time, before stubs run).
//
// `NEXT_PUBLIC_API_URL` is `host:port` (e.g. `localhost:8080`); the scheme
// comes from `NEXT_PUBLIC_API_SCHEME` (default `http`). For TLS deployments
// set `NEXT_PUBLIC_API_SCHEME=https`.
//
// Falls back to `localhost:8080` if the env var is unset in non-production —
// without this an unset NEXT_PUBLIC_API_URL produces opaque "http://undefined/..."
// fetch errors at write-time instead of at boot.
//
// Logical/un-prefixed PV name handling: this module passes `pvName` through
// to the backend as-is. Unlike the rest of the codebase (which routes through
// `getPrefixedPV`), L4 OPCPA PV names are already fully-qualified strings —
// see `frontend/src/app/(modules)/l4-opcpa/lib/pv-names.ts`. Once the python
// backend lands, reconcile this convention so dev `getPrefixedPV` prefix
// mapping applies to L4 too.
function apiBase(): string {
  const env = process.env.NEXT_PUBLIC_API_URL
  const scheme = process.env.NEXT_PUBLIC_API_SCHEME || 'http'
  if (!env || env === 'undefined') {
    if (process.env.NODE_ENV !== 'production') {
      return `${scheme}://localhost:8080`
    }
    throw new Error(
      'NEXT_PUBLIC_API_URL is not set; cannot determine backend URL',
    )
  }
  return `${scheme}://${env}`
}

interface WriteResult {
  ok: boolean
  error?: string
}

async function authHeaders(): Promise<Record<string, string>> {
  // Bound getSession with a short timeout — in some dev configurations
  // /api/auth/session can hang and would otherwise block every write.
  const session = await Promise.race([
    getSession(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
  ])
  const token = session?.accessToken ?? 'dev-no-session'
  return { Authorization: `Bearer ${token}` }
}

export async function pvWrite(
  pvName: string,
  value: number | string,
): Promise<void> {
  const auth = await authHeaders()
  const res = await fetch(`${apiBase()}/pv/${encodeURIComponent(pvName)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ value }),
  })
  if (!res.ok) {
    throw new Error(`PV write ${pvName} failed (HTTP ${res.status})`)
  }
  const data = (await res.json().catch(() => ({}))) as WriteResult
  if (data && data.ok === false) {
    throw new Error(data.error || `PV write ${pvName} failed`)
  }
}

export async function listWaveforms(): Promise<string[]> {
  const auth = await authHeaders()
  const res = await fetch(`${apiBase()}/waveforms`, { headers: auth })
  if (!res.ok) throw new Error(`waveforms list HTTP ${res.status}`)
  const data = await res.json()
  return Array.isArray(data) ? data : []
}
