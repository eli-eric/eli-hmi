import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const useRuntimeConfig = vi.hoisted(() => vi.fn())

vi.mock('@/lib/runtime-config/context', () => ({ useRuntimeConfig }))
vi.mock('next-auth/react', () => ({ signOut: vi.fn() }))
vi.mock('next/navigation', () => ({ usePathname: () => '/l4-opcpa' }))

import { PaletteProvider } from '@/lib/palette/context'

import NavigationBar from './navigation-bar'

const renderNav = () =>
  render(
    <PaletteProvider>
      <NavigationBar />
    </PaletteProvider>,
  )

describe('NavigationBar', () => {
  it('names the station from the zone and links it to the home route', () => {
    useRuntimeConfig.mockReturnValue({
      status: 'ready',
      navigationItems: [{ text: 'L4 OPCPA Controls', href: '/l4-opcpa' }],
      homeRoute: '/l4-opcpa',
      title: 'L4 OPCPA',
    })

    renderNav()

    const item = screen.getByText('L4 OPCPA Controls')
    expect(item.closest('a')).toHaveAttribute('href', '/l4-opcpa')
    // The header used to say "E3 VACUUM SYSTEM" whatever the zone was, while
    // linking to that zone's home route — a name and a destination that
    // disagreed.
    expect(screen.queryByText('E3 VACUUM SYSTEM')).toBeNull()
    expect(screen.getByText('L4 OPCPA').closest('a')).toHaveAttribute(
      'href',
      '/l4-opcpa',
    )
  })

  it('renders the bare shell while runtime config is loading', () => {
    useRuntimeConfig.mockReturnValue({
      status: 'loading',
      navigationItems: [],
      homeRoute: null,
      title: null,
    })

    renderNav()

    expect(screen.queryByText('L4 OPCPA Controls')).toBeNull()
    // No station name at all rather than a guess that might be the wrong one.
    expect(screen.queryByRole('link')).toBeNull()
    // The palette control does not depend on zone config, so it is usable
    // even while that config is still loading — or failing to.
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })
})
