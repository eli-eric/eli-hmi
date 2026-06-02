import type { Metadata } from 'next'
import NavigationBar from '@/components/navigation/navigation-bar'

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
    <>
      <NavigationBar />
      <main className="layout-container">
        <div className="page-container">{children}</div>
      </main>
    </>
  )
}
