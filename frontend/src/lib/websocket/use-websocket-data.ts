'use client'

import { useEffect, useReducer, useRef } from 'react'

import { Message, WebSocketContextValue } from '@/app/providers/types'
import { useWebSocketContext } from '@/app/providers/socket-provider'
import { getPrefixedPV } from '@/lib/utils/pv-helpers'

export type State<T> = Record<string, Message<T>>

interface MultiOptions<T> {
  pvs: string[]
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
      data: state[getPrefixedPV(input)],
      isConnected: ctx.isConnected,
    }
  }
  return {
    byPv: (pv: string) => state[getPrefixedPV(pv)],
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
  pvs: string[],
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

  const pvKey = pvs.join(',')

  useEffect(() => {
    if (!isConnected || pvs.length === 0) return
    const wireNames = pvs.map(getPrefixedPV)
    const unsubs = wireNames.map((pv) =>
      subscribe<T>(pv, (msg) => {
        dispatch({ type: 'UPDATE', pv, msg })
        onUpdateSingleRef.current?.(msg)
        if (onUpdateMultiRef.current) {
          const all = [
            ...Object.values(stateRef.current).filter((m) => m.name !== pv),
            msg,
          ]
          onUpdateMultiRef.current(all)
        }
      }),
    )
    return () => {
      unsubs.forEach((u) => u())
      dispatch({ type: 'RESET' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pvKey, subscribe, isConnected])

  return state
}
