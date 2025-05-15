import { ListItem } from '@/components/ui/lists/list-item'
import { withReactWebSocketData } from '../with-websocket-data'
import { useWebSocketContext } from '@/app/providers/socket-provider'
import { Message } from '@/app/providers/types'

interface InterlockItemProps {
  data?: Message<boolean> | null
  title: string
}

const InterlockItem = ({ title, data }: InterlockItemProps) => {
  const value = data?.value
  const { isConnected } = useWebSocketContext()
  return <ListItem title={title} value={value} isConnected={isConnected} />
}

export const InterLockContainer = withReactWebSocketData(InterlockItem)

export const Interlocks = ({
  interlocks,
}: {
  interlocks: {
    title: string
    pvName: string
  }[]
}) => {
  return (
    <div>
      {interlocks.map((interlock) => (
        <InterLockContainer
          key={interlock.pvName}
          pvname={interlock.pvName}
          title={interlock.title}
        />
      ))}
    </div>
  )
}
