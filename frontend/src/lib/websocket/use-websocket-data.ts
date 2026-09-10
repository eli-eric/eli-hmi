'use client'

import { useEffect, useReducer, useRef } from 'react'

import {
  Message,
  SubscribeOptions,
  WebSocketContextValue,
} from '@/app/providers/types'
import { useWebSocketContext } from '@/app/providers/socket-provider'
import { getPrefixedPV } from '@/lib/utils/pv-helpers'
import { severityTone } from './severity'

export type State<T> = Record<string, Message<T>>

interface MultiOptions<T> {
  pvs: readonly string[]
  onUpdate?: (msgs: Message<T>[]) => void
  /**
   * Skip the dev-prefix mapping (`getPrefixedPV`). Use this when callers
   * already pass fully-qualified wire names — e.g. L4 OPCPA uses
   * `BI_<L>_SHUTTER`, `AI_TEMP_<L>_REGEN`, … verbatim, and the prefix
   * mapping would otherwise mangle names whose suffix happens to match a
   * `PV_PREFIX_CONFIG` key (e.g. "TEMP" → `AI_K_AI_TEMP_<L>_REGEN`).
   */
  raw?: boolean
  /**
   * Gateway datatype for these PVs. Enum records need 'enum_string' to arrive
   * as their state name instead of the numeric index. One hook = one datatype;
   * mixed groups need separate hooks (see FlashlampsSection).
   */
  datatype?: SubscribeOptions['datatype']
}

interface SingleOptions<T> {
  onUpdate?: (msg: Message<T>) => void
  /** See `MultiOptions.raw`. */
  raw?: boolean
  /** See `MultiOptions.datatype`. */
  datatype?: SubscribeOptions['datatype']
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
  const raw = isSingle ? !!singleOpts?.raw : !!input.raw
  const datatype = isSingle ? singleOpts?.datatype : input.datatype

  const state = useMultiSubscription<T>(
    ctx,
    pvs,
    onUpdateMulti,
    onUpdateSingle,
    raw,
    datatype,
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
  { type: 'UPDATE'; pv: string; msg: Message<T> } | { type: 'RESET' }

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
  raw: boolean,
  datatype: SubscribeOptions['datatype'],
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

  // Per-PV memory of the last trustworthy reading, so an INVALID/disconnected
  // message (whose own `value` is normally null) can still report what the
  // value was before it went bad.
  const lastValidRef = useRef<
    Map<string, { value: T | null; timestamp: number }>
  >(new Map())

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
      const wireName = raw ? logicalPv : getPrefixedPV(logicalPv)
      return subscribe<T>(
        wireName,
        (msg) => {
          // Project the wire-format message into logical space so consumers
          // never see the dev prefix anywhere.
          const logicalMsg: Message<T> = { ...msg, name: logicalPv }
          if (severityTone(logicalMsg) === 'invalid') {
            const remembered = lastValidRef.current.get(logicalPv)
            if (remembered) logicalMsg.lastValid = remembered
          } else {
            lastValidRef.current.set(logicalPv, {
              value: logicalMsg.value,
              timestamp: logicalMsg.timestamp,
            })
          }
          // Update the synchronous mirror BEFORE dispatch so multi-PV updates
          // arriving in the same tick see each other in `onUpdate`'s snapshot.
          stateRef.current = { ...stateRef.current, [logicalPv]: logicalMsg }
          dispatch({ type: 'UPDATE', pv: logicalPv, msg: logicalMsg })
          onUpdateSingleRef.current?.(logicalMsg)
          onUpdateMultiRef.current?.(Object.values(stateRef.current))
        },
        datatype ? { datatype } : undefined,
      )
    })
    return () => {
      unsubs.forEach((u) => u())
      stateRef.current = {}
      lastValidRef.current = new Map()
      dispatch({ type: 'RESET' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pvKey, subscribe, isConnected, raw, datatype])

  return state
}
