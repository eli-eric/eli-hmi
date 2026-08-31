import { describe, it, expect } from 'vitest'
import { makeCommandPv, pv, LASER_COMMANDS } from './pv-names'

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

  it('makeCommandPv resolves the YAML override, else falls back to CMD_<laser>_<NAME>', () => {
    const cmdPv = makeCommandPv('NL2', {
      ALIGNMENT_MODE: 'L4-OPCPA-NL2:SetAlignmentMode',
      SET_DELAY: 'L4-OPCPA-NL2:PS5059:22:SetBothChannelsTrigDelay',
    })
    expect(cmdPv('ALIGNMENT_MODE')).toBe('L4-OPCPA-NL2:SetAlignmentMode')
    expect(cmdPv('SET_DELAY')).toBe(
      'L4-OPCPA-NL2:PS5059:22:SetBothChannelsTrigDelay',
    )
    expect(cmdPv('START_LASER')).toBe('CMD_NL2_START_LASER')
  })
})
