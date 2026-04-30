const isDev =
  typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'

export function debug(scope: string, ...args: unknown[]): void {
  if (!isDev) return
  // eslint-disable-next-line no-console
  console.log(`[${scope}]`, ...args)
}
