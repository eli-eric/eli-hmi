import type { Metadata } from 'next'
import NavigationBar from '@/components/navigation/navigation-bar'
import { StatusBar } from '@/components/ws-components/status-bar/status-bar'

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
    <>
      <NavigationBar />
      <main className="layout-container">
        <StatusBar />
        <div className="page-container">{children}</div>
      </main>
    </>
  )
}
