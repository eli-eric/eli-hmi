'use client'
import { TooltipProvider } from '@/components/ui/tooltip/tooltip'
import { PaletteProvider } from '@/lib/palette/context'
import { RuntimeConfigProvider } from '@/lib/runtime-config/context'
import { WebSocketProvider } from './socket-provider'
import { SessionProvider } from 'next-auth/react'

export const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <RuntimeConfigProvider>
      <SessionProvider>
        <WebSocketProvider>
          <PaletteProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </PaletteProvider>
        </WebSocketProvider>
      </SessionProvider>
    </RuntimeConfigProvider>
  )
}
