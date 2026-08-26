import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CogToggle } from './CogToggle'

const floatingPanelOf = (child: HTMLElement) =>
  child.closest('[data-floating="true"]')

describe('CogToggle', () => {
  it('carries the page palette onto the panel it portals to <body>', async () => {
    const user = userEvent.setup()
    render(
      <div data-palette="goggles">
        <CogToggle ariaLabel="Actions">
          <span>panel content</span>
        </CogToggle>
      </div>,
    )

    await user.click(screen.getByRole('button', { name: 'Actions' }))

    const panel = floatingPanelOf(screen.getByText('panel content'))
    // Portaled out of the palette scope: without the mirrored attribute the
    // panel would fall back to the global (non-goggles) colour tokens.
    expect(panel?.parentElement).toBe(document.body)
    expect(panel).toHaveAttribute('data-palette', 'goggles')
  })

  it('leaves the panel unstyled by a palette outside a palette scope', async () => {
    const user = userEvent.setup()
    render(
      <CogToggle ariaLabel="Actions">
        <span>panel content</span>
      </CogToggle>,
    )

    await user.click(screen.getByRole('button', { name: 'Actions' }))

    const panel = floatingPanelOf(screen.getByText('panel content'))
    expect(panel).not.toHaveAttribute('data-palette')
  })

  it('keeps an inline panel in normal flow, where it inherits the palette', async () => {
    const user = userEvent.setup()
    render(
      <div data-palette="goggles">
        <CogToggle ariaLabel="Actions" inlineLabel="General Actions">
          <span>panel content</span>
        </CogToggle>
      </div>,
    )

    await user.click(screen.getByRole('button', { name: 'Actions' }))

    const content = screen.getByText('panel content')
    expect(floatingPanelOf(content)).toBeNull()
    expect(content.closest('[data-palette="goggles"]')).not.toBeNull()
  })
})
