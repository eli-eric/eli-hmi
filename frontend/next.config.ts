import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone',
  // Pin the file-tracing root to this frontend project dir. Next 16's Turbopack
  // otherwise infers the repo root as the workspace root — a stray root-level
  // package-lock.json (with no matching package.json) lives there — which nests
  // the standalone output under .next/standalone/frontend/ and breaks the
  // Dockerfile's `COPY .next/standalone ./` + `CMD ["node","server.js"]`.
  // `next build`/`start` always run with cwd = this dir (package.json scripts +
  // Dockerfile WORKDIR), so process.cwd() resolves to the project root.
  outputFileTracingRoot: process.cwd(),
  // NB: zone + module config (CSI-861) is read at runtime from CONFIG_DIR (a
  // mounted directory), never from the source tree — nothing to trace into the
  // standalone output. The in-repo ../eli-hmi-config template is a dev-only
  // fallback, deliberately NOT baked into the image so a missing mount fails
  // fast instead of silently serving dev config.
}

export default nextConfig
