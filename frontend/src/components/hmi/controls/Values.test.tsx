import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FloatValue, IntegerValue, StringValue, BoolPill } from './Values'
import type { Message } from '@/app/providers/types'

function msg<T>(over: Partial<Message<T>> & { value: T }): Message<T> {
  return {
    type: 'pv',
    name: 'AI_X',
    severity: 0,
    units: null,
    timestamp: 0,
    ok: true,
    error: null,
    ...over,
  }
}

describe('FloatValue', () => {
  it('renders the plain value with no severity styling', () => {
    render(<FloatValue data={msg({ value: 1.5 })} />)
    const el = screen.getByText('1.500')
    expect(el).not.toHaveAttribute('data-tone')
  })

  it('applies warning/error/invalid tone by default based on severity', () => {
    const { rerender } = render(
      <FloatValue data={msg({ value: 1.5, severity: 1 })} />,
    )
    expect(screen.getByText('1.500')).toHaveAttribute('data-tone', 'warning')

    rerender(<FloatValue data={msg({ value: 1.5, severity: 2 })} />)
    expect(screen.getByText('1.500')).toHaveAttribute('data-tone', 'error')

    rerender(<FloatValue data={msg({ value: 1.5, severity: 3 })} />)
    expect(screen.getByText('1.500')).toHaveAttribute('data-tone', 'invalid')

    // ok:false always falls back to the placeholder (never shows a stale
    // value), but the placeholder itself now carries the invalid tone.
    rerender(<FloatValue data={msg({ value: 1.5, ok: false })} />)
    expect(screen.getByText('<>')).toHaveAttribute('data-tone', 'invalid')
  })

  it('opts out of severity styling via respectSeverity={false}', () => {
    render(
      <FloatValue
        data={msg({ value: 1.5, severity: 3 })}
        respectSeverity={false}
      />,
    )
    expect(screen.getByText('1.500')).not.toHaveAttribute('data-tone')
  })

  it('shows the placeholder with an invalid tone when disconnected', () => {
    render(<FloatValue data={msg({ value: null, ok: false })} />)
    const el = screen.getByText('<>')
    expect(el).toHaveAttribute('data-tone', 'invalid')
  })

  it('shows the plain placeholder (no tone) when there is no message yet', () => {
    render(<FloatValue data={undefined} />)
    const el = screen.getByText('<>')
    expect(el).not.toHaveAttribute('data-tone')
  })
})

describe('IntegerValue', () => {
  it('applies severity tone to the rounded value', () => {
    render(<IntegerValue data={msg({ value: 4.7, severity: 2 })} />)
    expect(screen.getByText('5')).toHaveAttribute('data-tone', 'error')
  })
})

describe('StringValue', () => {
  it('applies severity tone to the text value', () => {
    render(<StringValue data={msg({ value: 'std-100ps', severity: 1 })} />)
    expect(screen.getByText('std-100ps')).toHaveAttribute(
      'data-tone',
      'warning',
    )
  })
})

describe('BoolPill', () => {
  it('renders the normal on/off tone with no severity', () => {
    render(
      <BoolPill data={msg({ value: 1 })} onLabel="is OPEN" offLabel="is CLOSED" />,
    )
    expect(screen.getByText('is OPEN')).toHaveAttribute(
      'data-tone',
      'positive-important',
    )
  })

  it('overrides the on/off tone with EPICS severity, keeping the on/off label', () => {
    render(
      <BoolPill
        data={msg({ value: 1, severity: 2 })}
        onLabel="is OPEN"
        offLabel="is CLOSED"
      />,
    )
    const el = screen.getByText('is OPEN')
    expect(el).toHaveAttribute('data-tone', 'error')
  })

  it('overrides to invalid when disconnected, regardless of the last value', () => {
    render(
      <BoolPill
        data={msg({ value: 1, ok: false })}
        onLabel="is OPEN"
        offLabel="is CLOSED"
      />,
    )
    expect(screen.getByText('is OPEN')).toHaveAttribute('data-tone', 'invalid')
  })

  it('opts out of severity styling via respectSeverity={false}', () => {
    render(
      <BoolPill
        data={msg({ value: 1, severity: 2 })}
        onLabel="is OPEN"
        offLabel="is CLOSED"
        respectSeverity={false}
      />,
    )
    expect(screen.getByText('is OPEN')).toHaveAttribute(
      'data-tone',
      'positive-important',
    )
  })
})
