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
  // The L4 OPCPA page reads lasers.yaml via fs. It's statically prerendered
  // (no dynamic APIs), so the read + zod validation happen at `next build` and
  // the file isn't needed at runtime today. This include is a safety net for a
  // possible future dynamic conversion: with output: 'standalone', @vercel/nft
  // can't trace a path built from process.cwd(). Verified the YAML lands in
  // .next/standalone/src/app/(modules)/l4-opcpa/config/ after `next build`.
  // NB: route groups like (modules) aren't in the URL path, so this key's
  // matching is Next-version-sensitive — re-verify the standalone output if you
  // upgrade Next or make this route dynamic.
  outputFileTracingIncludes: {
    '/(modules)/l4-opcpa': [
      './src/app/(modules)/l4-opcpa/config/lasers.yaml',
    ],
  },
}

export default nextConfig
