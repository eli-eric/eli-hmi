import { describe, it, expect } from 'vitest'
import { pv, LASER_COMMANDS } from './pv-names'

describe('L4 OPCPA command vocabulary', () => {
  it('LASER_COMMANDS is the closed command list', () => {
    expect(LASER_COMMANDS).toEqual([
      'START_LASER',
      'STOP_LASER',
      'ALIGNMENT_MODE',
      'SYSTEM_STANDBY',
      'FLASHLAMPS_RUN',
      'FLASHLAMPS_STANDBY',
      'MODBOX_ON',
      'MODBOX_OFF',
      'SET_DELAY',
      'LOAD_WAVEFORM',
    ])
  })

  it('pv.cmd builds CMD_<laser>_<NAME>', () => {
    expect(pv.cmd('NL2', 'START_LASER')).toBe('CMD_NL2_START_LASER')
    expect(pv.cmd('NL5', 'LOAD_WAVEFORM')).toBe('CMD_NL5_LOAD_WAVEFORM')
  })
})
