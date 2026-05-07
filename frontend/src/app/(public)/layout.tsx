import type { Metadata } from 'next'

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
    <main className="layout-container">
      <div className="page-container">{children}</div>
    </main>
  )
}
