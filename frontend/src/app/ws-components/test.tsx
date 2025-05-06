import React from 'react'
import { Message } from '@/lib/websocket-provider/message'
import { withWebSocketData } from './withWebSocketData'

interface MyComponentProps {
  data?: Message<number>
}

const TestComponent = ({ data }: MyComponentProps) => {
  return (
    <div>
      {data
        ? `Value: ${data?.value?.toExponential(2)} ${data?.units}`
        : 'No data available'}
    </div>
  )
}

// Nastavení displayName pro původní komponentu (volitelné, ale užitečné)
TestComponent.displayName = 'TestComponent'

export const TestComp = withWebSocketData(TestComponent)
