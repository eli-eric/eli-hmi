function isLocalAuthority(authority: string): boolean {
  const host = authority.split(':')[0]
  return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0'
}

function browserAuthorityFrom(authority: string | null): string | null {
  if (typeof window === 'undefined') return null
  const rawPort = authority?.split(':')[1]
  const port = rawPort && rawPort.trim() !== '' ? rawPort : '8080'
  return `${window.location.hostname}:${port}`
}

function apiAuthority(): string {
  const envAuthority = process.env.NEXT_PUBLIC_API_URL
  const sanitized =
    envAuthority && envAuthority !== 'undefined' ? envAuthority : null

  if (!sanitized) {
    return browserAuthorityFrom(null) ?? 'localhost:8080'
  }

  // NEXT_PUBLIC_* vars are baked at build time. If an image is built with
  // localhost and then deployed remotely, prefer the runtime browser host.
  if (isLocalAuthority(sanitized)) {
    return browserAuthorityFrom(sanitized) ?? sanitized
  }

  return sanitized
}

function apiScheme(): string {
  const envScheme = process.env.NEXT_PUBLIC_API_SCHEME
  if (envScheme === 'http' || envScheme === 'https') return envScheme
  if (typeof window !== 'undefined') {
    return window.location.protocol === 'https:' ? 'https' : 'http'
  }
  return 'http'
}

function wsScheme(): string {
  return apiScheme() === 'https' ? 'wss' : 'ws'
}

const authority = apiAuthority()

export const WS_URL = `${wsScheme()}://${authority}/ws/pvs`
export const API_URL = `${apiScheme()}://${authority}/pv`
