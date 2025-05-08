import { withWebSocketData } from '@/app/ws-components/withWebSocketData'
import { Message } from '@/lib/websocket-provider/message'
import { ListItem } from '@/components/ui/lists/list-item'
import { useWebSocketProvider } from '@/app/providers/socket-provider'

interface InterlockItemProps {
  data?: Message<boolean> | null
  title: string
}

const InterlockItem = ({ title, data }: InterlockItemProps) => {
  const value = data?.value
  const { isConnected } = useWebSocketProvider()
  return <ListItem title={title} value={value} isConnected={isConnected} />
}

export const InterLockContainer = withWebSocketData(InterlockItem)

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
