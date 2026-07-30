'use client'

/**
 * Error boundary for the L4 OPCPA page. The most likely failure here is a
 * broken/missing zone or laser config (runtime-loaded, see CSI-861). In
 * production Next strips error details from the client — the full operator
 * message is in the server logs (and the container fails at startup via
 * instrumentation.ts for config errors, so reaching this at runtime usually
 * means the config dir changed under a running server).
 */
export default function L4OpcpaError({ error }: { error: Error }) {
  return (
    <div style={{ padding: '2rem' }}>
      <h2>L4 OPCPA configuration error</h2>
      <p>
        The page could not load its configuration. Check the server logs for
        the exact reason (zone file, laser config reference, or validation
        error).
      </p>
      {process.env.NODE_ENV !== 'production' && <pre>{error.message}</pre>}
    </div>
  )
}
