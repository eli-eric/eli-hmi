import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})

// `getSession()` would hit /api/auth/session, which doesn't exist in jsdom.
// All tests default to a placeholder access token. Tests that need to
// exercise the unauthenticated path should call `mockUnauthenticated()` in
// their `beforeEach`.
const AUTHED_SESSION = {
  user: { id: 'test', name: 'test', email: 'test@test' },
  accessToken: 'test-token',
  expires: '2099-01-01',
}

vi.mock('next-auth/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-auth/react')>()
  return {
    ...actual,
    getSession: vi.fn(async () => AUTHED_SESSION),
  }
})

/** Opt-out of the default authenticated mock for a single test/spec block. */
export async function mockUnauthenticated(): Promise<void> {
  const { getSession } = await import('next-auth/react')
  vi.mocked(getSession).mockResolvedValueOnce(null)
}

/** Reset getSession to the default authenticated mock (call in afterEach). */
export async function resetSessionMock(): Promise<void> {
  const { getSession } = await import('next-auth/react')
  vi.mocked(getSession).mockResolvedValue(AUTHED_SESSION)
}
