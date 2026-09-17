import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FloatValue, IntegerValue, StringValue, BoolPill } from './Values'
import type { Message } from '@/app/providers/types'

function msg<T>(over: Partial<Message<T>> & { value: T }): Message<T> {
  return {
    type: 'pv',
    name: 'AI_X',
    severity: 0,
    status: null,
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

  it('renders three decimal places without a format — unchanged by config support', () => {
    // Guards the migration: adding the config layer must not restyle any
    // readout that never asked for a format.
    render(<FloatValue data={msg({ value: 23.456789 })} />)
    expect(screen.getByText('23.457')).toBeInTheDocument()
  })

  it('honours a configured number of decimal places', () => {
    render(
      <FloatValue
        data={msg({ value: 23.456789 })}
        format={{ format: 'fixed', toFixed: 1 }}
      />,
    )
    expect(screen.getByText('23.5')).toBeInTheDocument()
  })

  it('honours a configured non-decimal format', () => {
    render(
      <FloatValue
        data={msg({ value: 0.001234 })}
        format={{ format: 'exponential', toExponential: 2 }}
      />,
    )
    expect(screen.getByText('1.23e-3')).toBeInTheDocument()
  })

  it('prefers the config over a component fallback', () => {
    render(
      <FloatValue
        data={msg({ value: 790 })}
        format={{ format: 'fixed', toFixed: 2 }}
        formatFallback={{ format: 'raw' }}
      />,
    )
    expect(screen.getByText('790.00')).toBeInTheDocument()
  })

  it("uses a component's fallback when the config is silent", () => {
    render(
      <FloatValue data={msg({ value: 790 })} formatFallback={{ format: 'raw' }} />,
    )
    expect(screen.getByText('790')).toBeInTheDocument()
  })

  it('still formats a severity-tinted value', () => {
    render(
      <FloatValue
        data={msg({ value: 23.456, severity: 2 })}
        format={{ format: 'fixed', toFixed: 1 }}
      />,
    )
    expect(screen.getByText('23.5')).toHaveAttribute('data-tone', 'error')
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

describe('units', () => {
  it('shows nothing when no source supplies a unit', () => {
    render(<FloatValue data={msg({ value: 1.5 })} />)
    expect(screen.getByText('1.500')).toBeInTheDocument()
    expect(screen.queryByText('°C')).not.toBeInTheDocument()
  })

  it('shows the component fallback when config and metadata are silent', () => {
    render(<FloatValue data={msg({ value: 1.5 })} unitsFallback="°C" />)
    expect(screen.getByText('°C')).toBeInTheDocument()
  })

  it('prefers PV metadata over the component fallback', () => {
    render(
      <FloatValue data={msg({ value: 1.5, units: 'K' })} unitsFallback="°C" />,
    )
    expect(screen.getByText('K')).toBeInTheDocument()
    expect(screen.queryByText('°C')).not.toBeInTheDocument()
  })

  it('lets the config unit win over both', () => {
    render(
      <FloatValue
        data={msg({ value: 1.5, units: 'K' })}
        units="mbar"
        unitsFallback="°C"
      />,
    )
    expect(screen.getByText('mbar')).toBeInTheDocument()
    expect(screen.queryByText('K')).not.toBeInTheDocument()
  })

  it('hides the unit when severity replaced the value', () => {
    render(<FloatValue data={msg({ value: 1.5, ok: false })} units="°C" />)
    expect(screen.getByText('PV DSC')).toBeInTheDocument()
    expect(screen.queryByText('°C')).not.toBeInTheDocument()
  })

  it('hides the unit when no message has arrived yet', () => {
    render(<FloatValue data={undefined} units="°C" />)
    expect(screen.getByText('<>')).toBeInTheDocument()
    expect(screen.queryByText('°C')).not.toBeInTheDocument()
  })

  it('shows units on IntegerValue too', () => {
    render(<IntegerValue data={msg({ value: 1024 })} units="counts" />)
    expect(screen.getByText('1024')).toBeInTheDocument()
    expect(screen.getByText('counts')).toBeInTheDocument()
  })
})

it('reads a broken payload as invalid, not as missing data', () => {
  // These used to be the chiller cells' private TYPE / FAULT states. A
  // number that is not a number is an untrustworthy reading, which is what
  // 'invalid' already means — and `<>` would wrongly claim the PV had simply
  // not reported yet.
  const { rerender } = render(
    <FloatValue data={msg({ value: 'hot' as unknown as number })} />,
  )
  expect(screen.getByText('PV INV')).toHaveAttribute('data-tone', 'invalid')
  expect(screen.getByText('PV INV').title).toContain('expected a number')

  rerender(<FloatValue data={msg({ value: Number.NaN })} />)
  expect(screen.getByText('PV INV')).toHaveAttribute('data-tone', 'invalid')
  expect(screen.getByText('PV INV').title).toContain('non-finite')
})

it('lets a reported severity outrank our own read of the payload', () => {
  render(<FloatValue data={msg({ value: Number.NaN, ok: false })} />)
  expect(screen.getByText('PV DSC')).toHaveAttribute('data-tone', 'invalid')
})
describe('IntegerValue', () => {
  it('applies severity tone to the rounded value', () => {
    render(<IntegerValue data={msg({ value: 4.7, severity: 2 })} />)
    expect(screen.getByText('5')).toHaveAttribute('data-tone', 'error')
  })

  it('rounds without a format, so config support changed nothing', () => {
    render(<IntegerValue data={msg({ value: 4.7 })} />)
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('honours a configured format when one is given', () => {
    // Needed because the attenuator has a units role but had no formatting
    // knob at all before this.
    render(
      <IntegerValue
        data={msg({ value: 4.7 })}
        format={{ format: 'fixed', toFixed: 2 }}
      />,
    )
    expect(screen.getByText('4.70')).toBeInTheDocument()
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

  it('reads a non-string payload as invalid, not as missing data', () => {
    // The Regen state row sat on `<>` for exactly this reason: an enum record
    // subscribed at its native type sends the state's index, and `<>` claimed
    // the PV had never reported.
    render(<StringValue data={msg({ value: 2 as unknown as string })} />)
    const el = screen.getByText('PV INV')
    expect(el).toHaveAttribute('data-tone', 'invalid')
    expect(el.title).toContain('expected a string, got number')
    expect(el.title).toContain('enum record')
  })

  it('still shows `<>` when the PV genuinely has not reported', () => {
    render(<StringValue pvName="AI_X" data={undefined} />)
    expect(screen.getByText('<>')).toHaveAttribute('data-tone', 'unknown')
  })
})

describe('BoolPill', () => {
  it('is neutral in both states unless the caller asks for emphasis', () => {
    const { rerender } = render(
      <BoolPill
        data={msg({ value: 1 })}
        onLabel="is OPEN"
        offLabel="is CLOSED"
      />,
    )
    expect(screen.getByText('is OPEN')).not.toHaveAttribute('data-tone')

    rerender(
      <BoolPill
        data={msg({ value: 0 })}
        onLabel="is OPEN"
        offLabel="is CLOSED"
        onEmphasis="positive-important"
      />,
    )
    expect(screen.getByText('is CLOSED')).not.toHaveAttribute('data-tone')

    rerender(
      <BoolPill
        data={msg({ value: 1 })}
        onLabel="is OPEN"
        offLabel="is CLOSED"
        onEmphasis="positive-important"
      />,
    )
    expect(screen.getByText('is OPEN')).toHaveAttribute(
      'data-tone',
      'positive-important',
    )
  })

  it('overrides emphasis with EPICS severity, keeping the on/off label', () => {
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
        onEmphasis="positive-important"
        respectSeverity={false}
      />,
    )
    // No tone at all: opting out of severity opts out of the whole shared
    // decision, emphasis included.
    expect(screen.getByText('is OPEN')).not.toHaveAttribute('data-tone')
  })
})
