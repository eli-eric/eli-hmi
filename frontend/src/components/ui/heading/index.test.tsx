import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Heading } from '.'

describe('Heading', () => {
  it('renders the title text', () => {
    render(<Heading title="L4 OPCPA Controls" />)
    expect(
      screen.getByRole('heading', { name: 'L4 OPCPA Controls' }),
    ).toBeInTheDocument()
  })
})
