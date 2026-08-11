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

vi.mock('./parts/p3-egv-connector', () => ({
  P3EGVConnector: () => <span>P3 EGV connector</span>,
}))

vi.mock('./parts/p3-volumes', () => ({
  P3Volumes: () => <span>P3 volumes</span>,
}))

import { P3ControlsView } from './p3-controls-view'

describe('P3ControlsView', () => {
  it('passes runtime config through and preserves the bespoke bottom-row order', () => {
    const config = { heading: 'P3 from YAML' } as ModuleConfig

    render(<P3ControlsView config={config} />)

    expect(screen.getByText('P3 from YAML')).toBeInTheDocument()
    expect(
      Array.from(screen.getByTestId('bottom-row').children).map(
        (child) => child.textContent,
      ),
    ).toEqual(['P3 EGV connector', 'P3 volumes'])
  })
})
