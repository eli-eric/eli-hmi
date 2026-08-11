import type { ModuleConfig } from '@/lib/modules/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loadModuleConfig: vi.fn(),
}))

vi.mock('@/lib/modules/module-config-loader', () => ({
  loadModuleConfig: mocks.loadModuleConfig,
}))

vi.mock('./p3-controls-view', () => ({
  P3ControlsView: vi.fn(() => null),
}))

import P3ControlsPage, { dynamic } from './page'
import { P3ControlsView } from './p3-controls-view'

const runtimeConfig = { heading: 'P3 from YAML' } as ModuleConfig

describe('P3ControlsPage', () => {
  beforeEach(() => {
    mocks.loadModuleConfig.mockReset()
    mocks.loadModuleConfig.mockReturnValue(runtimeConfig)
  })

  it('is rendered dynamically so runtime config is not baked into the build', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  it('loads the p3 config and passes it to the client view', () => {
    const result = P3ControlsPage()

    expect(mocks.loadModuleConfig).toHaveBeenCalledOnce()
    expect(mocks.loadModuleConfig).toHaveBeenCalledWith('p3')
    expect(result.type).toBe(P3ControlsView)
    expect(result.props.config).toBe(runtimeConfig)
  })
})
