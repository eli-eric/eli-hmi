/**
 * Next instrumentation hook — runs once when the server boots, for every
 * compiled runtime. All real work lives in `instrumentation-node.ts`: the
 * `NEXT_RUNTIME` check is statically replaced per bundle, so the edge build
 * dead-code-eliminates the import and never sees `node:fs`/`process.exit`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateZoneConfigAtStartup } = await import(
      './instrumentation-node'
    )
    validateZoneConfigAtStartup()
  }
}
