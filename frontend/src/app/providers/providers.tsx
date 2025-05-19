'use client'
import { TooltipProvider } from '@/components/ui/tooltip/tooltip'
import { WebSocketProvider } from './socket-provider'
import { SessionProvider } from 'next-auth/react'

export const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <SessionProvider>
      <WebSocketProvider>
        <TooltipProvider>{children}</TooltipProvider>
      </WebSocketProvider>
    </SessionProvider>
  )
}
