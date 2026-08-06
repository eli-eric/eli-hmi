import type { ReactNode } from 'react'
import type { ModuleConfig } from '@/lib/modules/types'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/module-page/module-control-page', () => ({
  ModuleControlPage: ({
    config,
    bottomRow,
  }: {
    config: ModuleConfig
    bottomRow: ReactNode
  }) => (
    <div>
      <span>{config.heading}</span>
      <div data-testid="bottom-row">{bottomRow}</div>
    </div>
  ),
}))

vi.mock('./parts/l3bt-bis-connector', () => ({
  L3BTBisConnector: () => <span>L3BT BIS connector</span>,
}))

vi.mock('./parts/l3bt-egv-connector', () => ({
  L3BTEgvConnector: () => <span>L3BT EGV connector</span>,
}))

vi.mock('./parts/l3bt-sgv-connector', () => ({
  L3BTSgvConnector: () => <span>L3BT SGV connector</span>,
}))

vi.mock('./parts/s1-volume', () => ({
  S1Volume: () => <span>S1 volume</span>,
}))

vi.mock('./parts/s3-volume', () => ({
  S3Volume: () => <span>S3 volume</span>,
}))

import { L3BTControlsView } from './l3bt-controls-view'

describe('L3BTControlsView', () => {
  it('passes runtime config through and preserves the bespoke bottom-row order', () => {
    const config = { heading: 'L3BT from YAML' } as ModuleConfig

    render(<L3BTControlsView config={config} />)

    expect(screen.getByText('L3BT from YAML')).toBeInTheDocument()
    expect(
      Array.from(screen.getByTestId('bottom-row').children).map(
        (child) => child.textContent,
      ),
    ).toEqual([
      'L3BT BIS connector',
      'S1 volume',
      'L3BT SGV connector',
      'S3 volume',
      'L3BT EGV connector',
    ])
  })
})
