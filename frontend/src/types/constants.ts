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

function apiAuthority(rawApiUrl: string | null): string {
  const sanitized = rawApiUrl && rawApiUrl !== 'undefined' ? rawApiUrl : null

  if (!sanitized) {
    return browserAuthorityFrom(null) ?? 'localhost:8080'
  }

  // Runtime config is fetched once on load; if it points at localhost (e.g.
  // an image built/tested locally and then deployed remotely), prefer the
  // browser's own host so the app still reaches a real backend.
  if (isLocalAuthority(sanitized)) {
    return browserAuthorityFrom(sanitized) ?? sanitized
  }

  return sanitized
}

function apiScheme(rawApiScheme: string | null): string {
  if (rawApiScheme === 'http' || rawApiScheme === 'https') return rawApiScheme
  if (typeof window !== 'undefined') {
    return window.location.protocol === 'https:' ? 'https' : 'http'
  }
  return 'http'
}

function wsScheme(rawApiScheme: string | null): string {
  return apiScheme(rawApiScheme) === 'https' ? 'wss' : 'ws'
}

export function buildApiUrl(
  rawApiUrl: string | null,
  rawApiScheme: string | null,
): string {
  return `${apiScheme(rawApiScheme)}://${apiAuthority(rawApiUrl)}/pv`
}

export function buildWsUrl(
  rawApiUrl: string | null,
  rawApiScheme: string | null,
): string {
  return `${wsScheme(rawApiScheme)}://${apiAuthority(rawApiUrl)}/ws/pvs`
}
