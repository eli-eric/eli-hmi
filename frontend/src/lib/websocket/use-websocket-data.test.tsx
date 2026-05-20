import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  FakeWebSocketController,
  makeFakeWebSocketContext,
  TestWebSocketProvider,
} from '@/test/ws-test-provider'

import { useWebSocketData } from './use-websocket-data'

describe('useWebSocketData (single form)', () => {
  let fake: FakeWebSocketController

  beforeEach(() => {
    fake = makeFakeWebSocketContext()
  })

  function Probe({ pv }: { pv: string }) {
    const { data, isConnected } = useWebSocketData<number>(pv)
    return (
      <div>
        <span data-testid="value">{data?.value ?? 'null'}</span>
        <span data-testid="connected">{String(isConnected)}</span>
      </div>
    )
  }

  it('returns undefined until a Message arrives, then resolves', async () => {
    render(
      <TestWebSocketProvider value={fake.context}>
        <Probe pv="AI_X" />
      </TestWebSocketProvider>,
    )
    expect(screen.getByTestId('value').textContent).toBe('null')
    expect(screen.getByTestId('connected').textContent).toBe('true')

    await act(async () => {
      fake.push<number>('AI_X', { value: 1.23 })
    })

    expect(screen.getByTestId('value').textContent).toBe('1.23')
  })
})

describe('useWebSocketData (multi form)', () => {
  let fake: FakeWebSocketController

  beforeEach(() => {
    fake = makeFakeWebSocketContext()
  })

  function MultiProbe({ pvs }: { pvs: string[] }) {
    const { byPv } = useWebSocketData<number>({ pvs })
    return (
      <div>
        {pvs.map((pv) => (
          <span key={pv} data-testid={`v-${pv}`}>
            {byPv(pv)?.value ?? 'null'}
          </span>
        ))}
      </div>
    )
  }

  it('byPv resolves each subscribed PV independently', async () => {
    render(
      <TestWebSocketProvider value={fake.context}>
        <MultiProbe pvs={['AI_X', 'AI_Y']} />
      </TestWebSocketProvider>,
    )
    expect(screen.getByTestId('v-AI_X').textContent).toBe('null')
    expect(screen.getByTestId('v-AI_Y').textContent).toBe('null')

    await act(async () => {
      fake.push<number>('AI_X', { value: 10 })
      fake.push<number>('AI_Y', { value: 20 })
    })

    expect(screen.getByTestId('v-AI_X').textContent).toBe('10')
    expect(screen.getByTestId('v-AI_Y').textContent).toBe('20')
  })

  it('onUpdate receives Messages with logical names (not wire-prefixed)', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    try {
      const seen: string[][] = []
      function Probe() {
        useWebSocketData<number>({
          pvs: ['S1:PRESSURE'],
          onUpdate: (msgs) => seen.push(msgs.map((m) => m.name)),
        })
        return null
      }

      render(
        <TestWebSocketProvider value={fake.context}>
          <Probe />
        </TestWebSocketProvider>,
      )

      await act(async () => {
        fake.push<number>('AI_MBAR_S1:PRESSURE', { value: 1 })
      })

      expect(seen).toEqual([['S1:PRESSURE']])
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('onUpdate snapshot is fresh when multiple PVs update in the same tick', async () => {
    const seen: number[][] = []
    function Probe() {
      useWebSocketData<number>({
        pvs: ['AI_X', 'AI_Y'],
        onUpdate: (msgs) =>
          seen.push(msgs.map((m) => m.value as number).sort((a, b) => a - b)),
      })
      return null
    }

    render(
      <TestWebSocketProvider value={fake.context}>
        <Probe />
      </TestWebSocketProvider>,
    )

    await act(async () => {
      fake.push<number>('AI_X', { value: 10 })
      fake.push<number>('AI_Y', { value: 20 })
    })

    // Final invocation should see both values, not just the latest one.
    expect(seen[seen.length - 1]).toEqual([10, 20])
  })
})

describe('useWebSocketData (dev prefix burial)', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('subscribes to the prefixed wire name; consumers see the logical name', async () => {
    const fake = makeFakeWebSocketContext()
    let lastSubscribed: string | null = null
    const wrappedCtx = {
      ...fake.context,
      subscribe: (<T,>(channel: string, cb: (msg: import('@/app/providers/types').Message<T>) => void) => {
        lastSubscribed = channel
        return fake.context.subscribe(channel, cb)
      }) as typeof fake.context.subscribe,
    }

    function Probe() {
      const { data } = useWebSocketData<number>('S1:PRESSURE')
      return <span data-testid="v">{data?.value ?? 'null'}</span>
    }

    render(
      <TestWebSocketProvider value={wrappedCtx}>
        <Probe />
      </TestWebSocketProvider>,
    )
    expect(lastSubscribed).toBe('AI_MBAR_S1:PRESSURE')

    await act(async () => {
      fake.push<number>('AI_MBAR_S1:PRESSURE', { value: 0.5 })
    })
    expect(screen.getByTestId('v').textContent).toBe('0.5')
  })
})
