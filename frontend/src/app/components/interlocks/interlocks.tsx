import { withWebSocketData } from '@/app/components/withWebSocketData'
import { CheckIcon, CloseIcon } from '@/components/ui/icons'
import { Message } from '@/lib/websocket-provider/message'
import styles from './interlocks.module.css'

interface InterlockItemProps {
  data?: Message<boolean> | null
  title: string
}

const InterlockItem = ({ title, data }: InterlockItemProps) => {
  const value = data?.value
  return (
    <div className={styles.item}>
      <span>{title}</span>
      {value ? <CheckIcon /> : <CloseIcon />}
    </div>
  )
}

const InterLockContainer = withWebSocketData(InterlockItem)

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
