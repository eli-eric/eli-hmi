import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DetailList } from './DetailList'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('DetailList', () => {
  it('renders rows with duplicate labels without a React key collision', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <DetailList
        items={[
          { label: 'Ch1', state: 'ok' },
          { label: 'Ch1', state: 'err' },
        ]}
      />,
    )

    // Both duplicate-label rows render.
    expect(screen.getAllByText('Ch1')).toHaveLength(2)

    // React did not warn about a duplicate key.
    const warnedDuplicateKey = errSpy.mock.calls.some(
      (call) => typeof call[0] === 'string' && call[0].includes('same key'),
    )
    expect(warnedDuplicateKey).toBe(false)
  })
})
