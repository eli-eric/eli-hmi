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
      ALIGNMENT_MODE: { pvName: 'L4-OPCPA-NL2:SetAlignmentMode', value: 1 },
      MODBOX_OFF: { pvName: 'L4-OPCPA-NL2:ModboxMode', value: 'Sleep' },
    })
    expect(cmdPv('ALIGNMENT_MODE')).toEqual({
      pvName: 'L4-OPCPA-NL2:SetAlignmentMode',
      value: 1,
    })
    // A device PV that wants a word rather than a trigger.
    expect(cmdPv('MODBOX_OFF')).toEqual({
      pvName: 'L4-OPCPA-NL2:ModboxMode',
      value: 'Sleep',
    })
    // Unconfigured: the backend-sequence trigger, fired with 1.
    expect(cmdPv('START_LASER')).toEqual({
      pvName: 'CMD_NL2_START_LASER',
      value: 1,
    })
  })
})
