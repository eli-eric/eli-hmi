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
  // Config ships inside the image and is read with `readFileSync` at a path
  // computed from ZONE_CODE (see lib/settings/config-loader.ts). A computed
  // path is not statically analysable, so Next's tracing cannot find these
  // files on its own — list them, or the standalone output has no config and
  // every station comes up on /no-access.
  outputFileTracingIncludes: {
    '/**': [
      // A literal path, not `config/*.yaml`: these patterns are matched at
      // any depth, so the glob form also picks up the loader test fixtures
      // (src/lib/settings/__fixtures__/roots/*/config/global.yaml) and ships
      // them in the production image. Includes win over excludes, so the
      // pattern itself has to be the precise one.
      'config/global.yaml',
      'src/app/(modules)/*/config/zones/*.yaml',
    ],
  },
}

export default nextConfig
