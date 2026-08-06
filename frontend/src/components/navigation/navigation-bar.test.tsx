import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const useRuntimeConfig = vi.hoisted(() => vi.fn())

vi.mock('@/lib/runtime-config/context', () => ({ useRuntimeConfig }))
vi.mock('next-auth/react', () => ({ signOut: vi.fn() }))
vi.mock('next/navigation', () => ({ usePathname: () => '/l4-opcpa' }))

import NavigationBar from './navigation-bar'

describe('NavigationBar', () => {
  it('renders zone nav items and links the logo to the home route', () => {
    useRuntimeConfig.mockReturnValue({
      status: 'ready',
      navigationItems: [{ text: 'L4 OPCPA Controls', href: '/l4-opcpa' }],
      homeRoute: '/l4-opcpa',
    })

    render(<NavigationBar />)

    const item = screen.getByText('L4 OPCPA Controls')
    expect(item.closest('a')).toHaveAttribute('href', '/l4-opcpa')
    expect(screen.getByText('E3 VACUUM SYSTEM').closest('a')).toHaveAttribute(
      'href',
      '/l4-opcpa',
    )
  })

  it('renders the bare shell while runtime config is loading', () => {
    useRuntimeConfig.mockReturnValue({
      status: 'loading',
      navigationItems: [],
      homeRoute: null,
    })

    render(<NavigationBar />)

    expect(screen.queryByText('L4 OPCPA Controls')).toBeNull()
    expect(screen.getByText('E3 VACUUM SYSTEM').closest('a')).toBeNull()
  })
})
