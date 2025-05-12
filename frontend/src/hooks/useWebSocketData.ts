'use client'

import { useWebSocketContext } from '@/app/providers/socket-provider'
import { Message } from '@/app/providers/types'
import { useEffect, useReducer, useRef } from 'react'

/** State shape: map PV name → latest Message<T> */
export type State<T> = Record<string, Message<T>>

/** Reducer actions */
type Action<T> =
  | { type: 'UPDATE'; pv: string; msg: Message<T> }
  | { type: 'RESET' }

/** Reducer implementation */
function reducer<T>(state: State<T>, action: Action<T>): State<T> {
  switch (action.type) {
    case 'UPDATE':
      return { ...state, [action.pv]: action.msg }
    case 'RESET':
      return {}
    default:
      return state
  }
}

/** Hook options */
interface UseWebSocketMultiOptions<T> {
  /** array of PV names to subscribe */
  pvs: string[]
  /** optional callback whenever **any** PV updates */
  onDataUpdate?: (allMessages: Message<T>[]) => void
}

/**
 * Hook: subscribe to multiple PVs, keep latest messages in reducer,
 * call onDataUpdate on each change, and automatically clean up.
 */
export function useWebSocketMulti<T>({
  pvs,
  onDataUpdate,
}: UseWebSocketMultiOptions<T>) {
  const { subscribe, isConnected } = useWebSocketContext()

  // Reducer holds the latest Message for each PV
  const [state, dispatch] = useReducer(
    reducer as typeof reducer<T>,
    {} as State<T>,
  )

  // 1) Create a ref to mirror state
  const stateRef = useRef<State<T>>(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  // 2) Store onDataUpdate in a ref
  const callbackRef = useRef(onDataUpdate)
  useEffect(() => {
    callbackRef.current = onDataUpdate
  }, [onDataUpdate])

  useEffect(() => {
    if (!isConnected || pvs.length === 0) return

    const unsubscribes = pvs.map((pv) =>
      subscribe<T>(pv, (msg) => {
        // Update state
        dispatch({ type: 'UPDATE', pv, msg })

        // Read the freshest state from stateRef
        const allMessages = [
          ...Object.values(stateRef.current).filter((m) => m.name !== pv),
          msg,
        ]
        callbackRef.current?.(allMessages)
      }),
    )

    return () => {
      unsubscribes.forEach((u) => u())
      dispatch({ type: 'RESET' })
    }
    // now only depends on the *values* that truly matter:
  }, [pvs.join(','), subscribe, isConnected])

  return { state, isConnected }
}
