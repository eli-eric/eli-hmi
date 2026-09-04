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

  it('keeps the real value for MINOR / MAJOR alarms, tinting it', () => {
    const { rerender } = render(
      <FloatValue data={msg({ value: 1.5, severity: 1 })} />,
    )
    expect(screen.getByText('1.500')).toHaveAttribute('data-tone', 'warning')

    rerender(<FloatValue data={msg({ value: 1.5, severity: 2 })} />)
    expect(screen.getByText('1.500')).toHaveAttribute('data-tone', 'error')
  })

  it('replaces the value with PV INV for severity 3 and PV DSC when disconnected', () => {
    const { rerender } = render(
      <FloatValue data={msg({ value: 1.5, severity: 3 })} />,
    )
    expect(screen.getByText('PV INV')).toHaveAttribute('data-tone', 'invalid')
    expect(screen.queryByText('1.500')).not.toBeInTheDocument()

    rerender(<FloatValue data={msg({ value: 1.5, ok: false })} />)
    expect(screen.getByText('PV DSC')).toHaveAttribute('data-tone', 'invalid')
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

  it('shows <> with the unknown tone when no message has arrived yet', () => {
    render(<FloatValue data={undefined} />)
    expect(screen.getByText('<>')).toHaveAttribute('data-tone', 'unknown')
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

  it('replaces the on/off label with PV DSC when disconnected', () => {
    render(
      <BoolPill
        data={msg({ value: 1, ok: false })}
        onLabel="is OPEN"
        offLabel="is CLOSED"
      />,
    )
    expect(screen.getByText('PV DSC')).toHaveAttribute('data-tone', 'invalid')
    expect(screen.queryByText('is OPEN')).not.toBeInTheDocument()
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
