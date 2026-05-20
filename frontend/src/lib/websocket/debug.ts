const isDev =
  typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'

export function debug(scope: string, ...args: unknown[]): void {
  if (!isDev) return
  console.log(`[${scope}]`, ...args)
}
