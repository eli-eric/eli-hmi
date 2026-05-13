import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SectionCard } from './SectionCard'

describe('SectionCard', () => {
  it('renders its title in a heading and its children', () => {
    render(
      <SectionCard title="General">
        <p>inner content</p>
      </SectionCard>,
    )
    expect(
      screen.getByRole('heading', { name: 'General' }),
    ).toBeInTheDocument()
    expect(screen.getByText('inner content')).toBeInTheDocument()
  })
})
