import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone',
  env: {
    NEXT_PUBLIC_WEBSOCKET_URL: process.env.NEXT_PUBLIC_WEBSOCKET_URL,
    NODE_ENV: process.env.NODE_ENV,
  },
}

export default nextConfig
