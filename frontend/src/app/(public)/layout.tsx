import type { Metadata } from 'next'
import { Providers } from '../providers/providers'

import '../globals.css'

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
      <body>
        <Providers>
          <main className="layout-container">
            <div className="page-container">{children}</div>
          </main>
        </Providers>
      </body>
    </html>
  )
}
