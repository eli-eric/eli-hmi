/**
 * Recursively freeze a parsed-config value. Config objects live in
 * process-lifetime caches and are handed out by reference to every request —
 * freezing turns an accidental mutation into a loud TypeError (in strict
 * mode) instead of silent corruption of all subsequent requests.
 */
export function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key])
    }
  }
  return value
}
