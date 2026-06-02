import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DataRow } from './DataRow'

describe('DataRow', () => {
  it('renders the label and value', () => {
    render(<DataRow label="Regen Temp TK6:44" value="0.123" />)
    expect(screen.getByText('Regen Temp TK6:44')).toBeInTheDocument()
    expect(screen.getByText('0.123')).toBeInTheDocument()
  })

  it('sets a title on a string label so the full name is recoverable if it truncates', () => {
    render(<DataRow label="Atten. SM5:ATT1:51" value="42" />)
    expect(screen.getByText('Atten. SM5:ATT1:51')).toHaveAttribute(
      'title',
      'Atten. SM5:ATT1:51',
    )
  })

  it('does not set a title when the label is not a plain string', () => {
    render(<DataRow label={<span>Custom</span>} value="1" />)
    // The text lives in the inner node; no ancestor carries a title attribute.
    expect(screen.getByText('Custom').closest('[title]')).toBeNull()
  })
})
