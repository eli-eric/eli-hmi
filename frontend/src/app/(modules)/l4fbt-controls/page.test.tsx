import type { ModuleConfig } from '@/lib/modules/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loadModuleConfig: vi.fn(),
}))

vi.mock('@/lib/modules/module-config-loader', () => ({
  loadModuleConfig: mocks.loadModuleConfig,
}))

vi.mock('./l4fbt-controls-view', () => ({
  L4fBTControlsView: vi.fn(() => null),
}))

import L4fBTControlsPage, { dynamic } from './page'
import { L4fBTControlsView } from './l4fbt-controls-view'

const runtimeConfig = { heading: 'L4fBT from YAML' } as ModuleConfig

describe('L4fBTControlsPage', () => {
  beforeEach(() => {
    mocks.loadModuleConfig.mockReset()
    mocks.loadModuleConfig.mockReturnValue(runtimeConfig)
  })

  it('is rendered dynamically so runtime config is not baked into the build', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  it('loads the l4fbt config and passes it to the client view', () => {
    const result = L4fBTControlsPage()

    expect(mocks.loadModuleConfig).toHaveBeenCalledOnce()
    expect(mocks.loadModuleConfig).toHaveBeenCalledWith('l4fbt')
    expect(result.type).toBe(L4fBTControlsView)
    expect(result.props.config).toBe(runtimeConfig)
  })
})
