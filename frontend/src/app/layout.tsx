import type { Metadata } from 'next'

import './globals.css'
import { PALETTE_BOOTSTRAP_SCRIPT } from '@/lib/palette/palette'
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
        {/* Applies the stored colour palette before the first paint. It has to
            run here, blocking: an operator whose goggles hide red must not
            watch every page load repaint from red to magenta. See
            lib/palette/palette.ts. */}
        <script
          dangerouslySetInnerHTML={{ __html: PALETTE_BOOTSTRAP_SCRIPT }}
        />
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
