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
    // `suppressHydrationWarning` because the palette bootstrap script below
    // sets `data-palette` on this element before hydration, while the server
    // — which cannot see localStorage — renders it bare. The two therefore
    // differ here by design, and without this React reports it as a hydration
    // mismatch on every load. The prop is shallow: it exempts only this
    // element's own attributes and text, so everything under <body> keeps
    // full hydration checking. See lib/palette/palette.ts.
    <html lang="en" suppressHydrationWarning>
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
