import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanupMockWebSocket, mockWebSocketServer } from './ws-mock-server'
import type { Message } from '@/app/providers/types'

describe('mockWebSocketServer', () => {
  let server: ReturnType<typeof mockWebSocketServer>

  beforeEach(() => {
    server = mockWebSocketServer()
  })

  afterEach(async () => {
    await server.close()
    cleanupMockWebSocket()
  })

  it('records messages the client sends', async () => {
    const ws = new WebSocket(server.url)
    await new Promise<void>((r) => ws.addEventListener('open', () => r()))
    ws.send(JSON.stringify({ type: 'subscribe', pvs: { AI_X: true } }))
    await server.waitForSubscribe('AI_X')
    const sent = server.getSent()
    expect(sent).toHaveLength(1)
    expect(sent[0]).toEqual({ type: 'subscribe', pvs: { AI_X: true } })
  })

  it('pushPV delivers a Message<number> to the client', async () => {
    const ws = new WebSocket(server.url)
    await new Promise<void>((r) => ws.addEventListener('open', () => r()))
    const received: Message<number>[] = []
    ws.addEventListener('message', (e) => {
      received.push(JSON.parse(e.data as string) as Message<number>)
    })
    server.pushPV('AI_X', 1.23, { units: 'mbar' })
    await new Promise((r) => setTimeout(r, 0))
    expect(received).toHaveLength(1)
    expect(received[0].name).toBe('AI_X')
    expect(received[0].value).toBe(1.23)
    expect(received[0].units).toBe('mbar')
    expect(received[0].ok).toBe(true)
  })
})
