import type { Metadata } from 'next'

import './globals.css'
import { Providers } from './providers/providers'

export const metadata: Metadata = {
  title: 'ELI - HMI',
  description: 'ELI Human-Machine Interface',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        {/* Preload font files */}
        <link
          rel="preload"
          href="/fonts/RobotoCondensed-Regular.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/RobotoCondensed-Bold.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
