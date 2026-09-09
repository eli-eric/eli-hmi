import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { describe, expect, it } from 'vitest'

import { useCollapseOnAnyClick } from './use-collapse-on-any-click'

/**
 * A stand-in for the panel's expandable indicators (Modbox, MSS, module
 * errors, flashlamps), next to a header marked as collapse-exempt.
 */
function Harness() {
  const [expanded, setExpanded] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  useCollapseOnAnyClick(expanded, () => setExpanded(false), triggerRef)

  return (
    <div>
      <nav data-collapse-exempt>
        <button type="button">change palette</button>
      </nav>
      <button ref={triggerRef} type="button" onClick={() => setExpanded(true)}>
        expand
      </button>
      <button type="button">elsewhere</button>
      {expanded && <ul aria-label="detail" />}
    </div>
  )
}

const expand = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'expand' }))
  expect(screen.getByLabelText('detail')).toBeInTheDocument()
}

describe('useCollapseOnAnyClick', () => {
  it('collapses on a click anywhere in the panel', async () => {
    render(<Harness />)
    const user = userEvent.setup()
    await expand(user)

    await user.click(screen.getByRole('button', { name: 'elsewhere' }))
    expect(screen.queryByLabelText('detail')).toBeNull()
  })

  it('leaves the list open for clicks inside a collapse-exempt region', async () => {
    // The colour-palette selector lives in the header and exists to change how
    // these very indicators look — collapsing them on the way to it would
    // defeat the control.
    render(<Harness />)
    const user = userEvent.setup()
    await expand(user)

    await user.click(screen.getByRole('button', { name: 'change palette' }))
    expect(screen.getByLabelText('detail')).toBeInTheDocument()

    // Still collapses everywhere else, so the exemption is not a blanket one.
    await user.click(screen.getByRole('button', { name: 'elsewhere' }))
    expect(screen.queryByLabelText('detail')).toBeNull()
  })
})
