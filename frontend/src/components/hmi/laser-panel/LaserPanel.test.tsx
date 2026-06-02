import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LaserPanel } from './LaserPanel'

describe('LaserPanel', () => {
  it('renders the title and its children', () => {
    render(
      <LaserPanel title="NL2">
        <p>section content</p>
      </LaserPanel>,
    )
    expect(
      screen.getByRole('heading', { name: 'NL2' }),
    ).toBeInTheDocument()
    expect(screen.getByText('section content')).toBeInTheDocument()
  })

  it('exposes section components as static properties', () => {
    expect(LaserPanel.Sequencer).toBeDefined()
    expect(LaserPanel.General).toBeDefined()
    expect(LaserPanel.Regen).toBeDefined()
    expect(LaserPanel.Chillers).toBeDefined()
    expect(LaserPanel.Flashlamps).toBeDefined()
    expect(LaserPanel.Modbox).toBeDefined()
  })
})
