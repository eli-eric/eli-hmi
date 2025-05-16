'use client'
import { TooltipProvider } from '@/components/ui/tooltip/tooltip'
import { WebSocketProvider } from './socket-provider'

export const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <WebSocketProvider url="ws://localhost:8080/ws/pvs">
      <TooltipProvider>{children}</TooltipProvider>
    </WebSocketProvider>
  )
}
