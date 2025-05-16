import { FC } from 'react'
import { Message } from '@/app/providers/types'
import { withReactWebSocketData } from '../../with-websocket-data'
import { Gate } from './Gate'

interface GateConnectedProps {
  name: string
  label: string
  href: string
}

/**
 * GateConnected component
 *
 * A wrapper for the Gate component that connects it to WebSocket data
 */
const GateConnectedBase: FC<
  GateConnectedProps & { data: Message<number> | null; isConnected?: boolean }
> = ({ name, label, href, data, isConnected }) => {
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

export const GateConnected = withReactWebSocketData<number, GateConnectedProps>(
  GateConnectedBase,
)
