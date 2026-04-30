import { FC } from 'react'

import { useWebSocketData } from '@/lib/websocket/use-websocket-data'

import { Gate } from './Gate'

interface GateConnectedProps {
  pvname: string
  name: string
  label: string
  href: string
}

/**
 * Gate wired to a PV via {@link useWebSocketData}. Renders {@link Gate}.
 */
export const GateConnected: FC<GateConnectedProps> = ({
  pvname,
  name,
  label,
  href,
}) => {
  const { data, isConnected } = useWebSocketData<number>(pvname)
  return (
    <Gate
      name={name}
      label={label}
      href={href}
      data={data}
      isConnected={isConnected}
    />
  )
}
