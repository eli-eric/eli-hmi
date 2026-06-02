import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PanelSwitcher } from './panel-switcher'

describe('PanelSwitcher', () => {
  it('renders accessible prev/next controls and the current position', () => {
    render(
      <PanelSwitcher
        labels={['NL1', 'NL2', 'NL3']}
        activeIndex={0}
        onChange={() => {}}
      />,
    )
    expect(
      screen.getByRole('button', { name: /previous laser panel/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /next laser panel/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('NL1')).toBeInTheDocument()
    expect(screen.getByText('1 of 3')).toBeInTheDocument()
  })

  it('advances to the next panel and wraps around', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <PanelSwitcher
        labels={['NL1', 'NL2', 'NL3']}
        activeIndex={2}
        onChange={onChange}
      />,
    )
    await user.click(screen.getByRole('button', { name: /next laser panel/i }))
    expect(onChange).toHaveBeenCalledWith(0) // wraps 2 -> 0
  })

  it('steps to the previous panel and wraps around', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <PanelSwitcher
        labels={['NL1', 'NL2', 'NL3']}
        activeIndex={0}
        onChange={onChange}
      />,
    )
    await user.click(
      screen.getByRole('button', { name: /previous laser panel/i }),
    )
    expect(onChange).toHaveBeenCalledWith(2) // wraps 0 -> 2
  })
})
