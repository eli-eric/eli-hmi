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

vi.mock('./parts/l4fbt-p3-connector', () => ({
  L4fBTP3Connector: () => <span>L4fBT P3 connector</span>,
}))

vi.mock('./parts/l4fbt-s1-connector', () => ({
  L4fBTS1Connector: () => <span>L4fBT S1 connector</span>,
}))

vi.mock('./parts/s3-volumes', () => ({
  S3Volumes: () => <span>S3 volumes</span>,
}))

import { L4fBTControlsView } from './l4fbt-controls-view'

describe('L4fBTControlsView', () => {
  it('passes runtime config through and preserves the bespoke bottom-row order', () => {
    const config = { heading: 'L4fBT from YAML' } as ModuleConfig

    render(<L4fBTControlsView config={config} />)

    expect(screen.getByText('L4fBT from YAML')).toBeInTheDocument()
    expect(
      Array.from(screen.getByTestId('bottom-row').children).map(
        (child) => child.textContent,
      ),
    ).toEqual(['L4fBT S1 connector', 'S3 volumes', 'L4fBT P3 connector'])
  })
})
