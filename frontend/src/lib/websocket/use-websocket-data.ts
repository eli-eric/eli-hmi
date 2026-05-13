'use client'

import { useEffect, useReducer, useRef } from 'react'

import { Message, WebSocketContextValue } from '@/app/providers/types'
import { useWebSocketContext } from '@/app/providers/socket-provider'
import { getPrefixedPV } from '@/lib/utils/pv-helpers'

export type State<T> = Record<string, Message<T>>

interface MultiOptions<T> {
  pvs: readonly string[]
  onUpdate?: (msgs: Message<T>[]) => void
}

interface SingleOptions<T> {
  onUpdate?: (msg: Message<T>) => void
}

interface MultiResult<T> {
  /**
   * Returns the latest `Message<T>` for a logical PV name, or `undefined` if
   * no message has arrived yet. The dev-prefix is applied internally — pass
   * the same name you passed in `pvs`.
   */
  byPv: (pv: string) => Message<T> | undefined
  state: State<T>
  isConnected: boolean
}

interface SingleResult<T> {
  /** Latest `Message<T>`, or `undefined` until the first message arrives. */
  data: Message<T> | undefined
  isConnected: boolean
}

/**
 * Subscribe to a single or many PVs.
 *
 * Single form: `useWebSocketData('AI_X')` → `{ data, isConnected }`.
 * Multi form: `useWebSocketData({ pvs: ['AI_X', 'AI_Y'] })` → `{ byPv, state, isConnected }`.
 *
 * The dev-vs-prod PV-name mapping (`getPrefixedPV`) is applied here, so callers
 * pass logical names and look them up the same way.
 */
export function useWebSocketData<T = unknown>(
  pv: string,
  opts?: SingleOptions<T>,
): SingleResult<T>
export function useWebSocketData<T = unknown>(
  opts: MultiOptions<T>,
): MultiResult<T>
export function useWebSocketData<T = unknown>(
  input: string | MultiOptions<T>,
  singleOpts?: SingleOptions<T>,
): SingleResult<T> | MultiResult<T> {
  const ctx = useWebSocketContext()
  const isSingle = typeof input === 'string'
  const pvs = isSingle ? [input] : input.pvs
  const onUpdateMulti = isSingle ? undefined : input.onUpdate
  const onUpdateSingle = isSingle ? singleOpts?.onUpdate : undefined

  const state = useMultiSubscription<T>(
    ctx,
    pvs,
    onUpdateMulti,
    onUpdateSingle,
  )

  if (isSingle) {
    return {
      data: state[input],
      isConnected: ctx.isConnected,
    }
  }
  return {
    byPv: (pv: string) => state[pv],
    state,
    isConnected: ctx.isConnected,
  }
}

type Action<T> =
  | { type: 'UPDATE'; pv: string; msg: Message<T> }
  | { type: 'RESET' }

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

function useMultiSubscription<T>(
  ctx: WebSocketContextValue,
  pvs: readonly string[],
  onUpdateMulti: ((msgs: Message<T>[]) => void) | undefined,
  onUpdateSingle: ((msg: Message<T>) => void) | undefined,
): State<T> {
  const { subscribe, isConnected } = ctx
  const [state, dispatch] = useReducer(
    reducer as typeof reducer<T>,
    {} as State<T>,
  )

  const stateRef = useRef<State<T>>(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const onUpdateMultiRef = useRef(onUpdateMulti)
  const onUpdateSingleRef = useRef(onUpdateSingle)
  useEffect(() => {
    onUpdateMultiRef.current = onUpdateMulti
    onUpdateSingleRef.current = onUpdateSingle
  }, [onUpdateMulti, onUpdateSingle])

  // Sort so re-ordering the `pvs` array doesn't trigger an unnecessary
  // resubscribe.
  const pvKey = [...pvs].sort().join(',')

  useEffect(() => {
    if (!isConnected || pvs.length === 0) return
    const unsubs = pvs.map((logicalPv) => {
      const wireName = getPrefixedPV(logicalPv)
      return subscribe<T>(wireName, (msg) => {
        // Project the wire-format message into logical space so consumers
        // never see the dev prefix anywhere.
        const logicalMsg: Message<T> = { ...msg, name: logicalPv }
        // Update the synchronous mirror BEFORE dispatch so multi-PV updates
        // arriving in the same tick see each other in `onUpdate`'s snapshot.
        stateRef.current = { ...stateRef.current, [logicalPv]: logicalMsg }
        dispatch({ type: 'UPDATE', pv: logicalPv, msg: logicalMsg })
        onUpdateSingleRef.current?.(logicalMsg)
        onUpdateMultiRef.current?.(Object.values(stateRef.current))
      })
    })
    return () => {
      unsubs.forEach((u) => u())
      stateRef.current = {}
      dispatch({ type: 'RESET' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pvKey, subscribe, isConnected])

  return state
}
