import type { ModuleConfig } from '@/lib/modules/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loadModuleConfig: vi.fn(),
}))

vi.mock('@/lib/modules/module-config-loader', () => ({
  loadModuleConfig: mocks.loadModuleConfig,
}))

vi.mock('./l3bt-controls-view', () => ({
  L3BTControlsView: vi.fn(() => null),
}))

import L3BTControlsPage, { dynamic } from './page'
import { L3BTControlsView } from './l3bt-controls-view'

const runtimeConfig = { heading: 'L3BT from YAML' } as ModuleConfig

describe('L3BTControlsPage', () => {
  beforeEach(() => {
    mocks.loadModuleConfig.mockReset()
    mocks.loadModuleConfig.mockReturnValue(runtimeConfig)
  })

  it('is rendered dynamically so runtime config is not baked into the build', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  it('loads the l3bt config and passes it to the client view', () => {
    const result = L3BTControlsPage()

    expect(mocks.loadModuleConfig).toHaveBeenCalledOnce()
    expect(mocks.loadModuleConfig).toHaveBeenCalledWith('l3bt')
    expect(result.type).toBe(L3BTControlsView)
    expect(result.props.config).toBe(runtimeConfig)
  })
})
