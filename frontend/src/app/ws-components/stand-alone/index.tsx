import { ValveIcon } from '@/components/ui/icons'

const SUContainer = ({ children }) => {
  return <div className={styles.SUContainer}>{children}</div>
}

const SUValveStatus = ({ data, isConnected, label }) => {
  return (
    <div>
      <div>
        <div />
        <ValveIcon />
        <div />
      </div>
    </div>
  )
}
