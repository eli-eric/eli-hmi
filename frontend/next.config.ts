import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone',
  // The L4 OPCPA page reads lasers.yaml via fs at build/render time. With
  // output: 'standalone', @vercel/nft can't trace a path built from
  // process.cwd(), so tell it to copy the YAML into the standalone bundle.
  outputFileTracingIncludes: {
    '/(modules)/l4-opcpa': [
      './src/app/(modules)/l4-opcpa/config/lasers.yaml',
    ],
  },
  env: {
    NEXT_PUBLIC_WEBSOCKET_URL: process.env.NEXT_PUBLIC_WEBSOCKET_URL,
  },
}

export default nextConfig
