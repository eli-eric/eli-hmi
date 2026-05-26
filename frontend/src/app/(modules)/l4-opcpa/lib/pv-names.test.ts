import { describe, it, expect } from 'vitest'
import { pv, LASER_COMMANDS } from './pv-names'

describe('pv (L4 OPCPA PV-name registry)', () => {
  describe('single PVs', () => {
    it('connection', () => {
      expect(pv.connection('NL2')).toBe('BI_NL2_CONN')
    })
    it('fullPower', () => {
      expect(pv.fullPower('NL2')).toBe('BI_NL2_FULLP')
    })
    it('shutter', () => {
      expect(pv.shutter('NL2')).toBe('BI_NL2_SHUTTER')
    })
    it('phdMean / phd2Mean', () => {
      expect(pv.phdMean('NL2')).toBe('AI_NL2_PHD_MEAN')
      expect(pv.phd2Mean('NL2')).toBe('AI_NL2_PHD2_MEAN')
    })
    it('regenState / regenTemp', () => {
      expect(pv.regenState('NL2')).toBe('BI_NL2_REGEN_STATE')
      expect(pv.regenTemp('NL2')).toBe('AI_TEMP_NL2_REGEN')
    })
    it('attenuator', () => {
      expect(pv.attenuator('NL2')).toBe('AI_NL2_ATT')
    })
    it('chiller readouts', () => {
      expect(pv.chillerFlow('NL2', '11')).toBe('AI_NL2_CHILLER_11_FLOW')
      expect(pv.chillerTemp('NL2', '11')).toBe('AI_NL2_CHILLER_11_TEMP')
      expect(pv.chillerLevel('NL2', '11')).toBe('AI_NL2_CHILLER_11_LEVEL')
    })
    it('flashlampChannel', () => {
      expect(pv.flashlampChannel('NL2', '22', '1')).toBe('SI_NL2_FL_22_CH1')
      expect(pv.flashlampChannel('NL2', '28', '2')).toBe('SI_NL2_FL_28_CH2')
    })
    it('triggerDelay', () => {
      expect(pv.triggerDelay('NL2', '1')).toBe('AI_NL2_TRIG_DELAY_CH1')
      expect(pv.triggerDelay('NL2', '2')).toBe('AI_NL2_TRIG_DELAY_CH2')
    })
    it('modboxState', () => {
      expect(pv.modboxState('NL2', 3)).toBe('BI_NL2_MODBOX_3')
    })
    it('loadedWaveform', () => {
      expect(pv.loadedWaveform('NL2')).toBe('SI_NL2_LOADED_WAVEFORM')
    })
    it('cmd', () => {
      expect(pv.cmd('NL2', 'START_LASER')).toBe('CMD_NL2_START_LASER')
      expect(pv.cmd('NL2', 'LOAD_WAVEFORM')).toBe('CMD_NL2_LOAD_WAVEFORM')
    })
  })

  describe('array helpers', () => {
    it('mssAll generates 1..N', () => {
      expect(pv.mssAll('NL2', 3)).toEqual([
        'BI_NL2_MSS_1',
        'BI_NL2_MSS_2',
        'BI_NL2_MSS_3',
      ])
    })
    it('moduleErrorsAll maps names', () => {
      expect(pv.moduleErrorsAll('NL2', ['REGEN', 'FLASHLAMPS'])).toEqual([
        'BI_NL2_ERR_REGEN',
        'BI_NL2_ERR_FLASHLAMPS',
      ])
    })
    it('modboxStateAll generates 1..N', () => {
      expect(pv.modboxStateAll('NL2', 2)).toEqual([
        'BI_NL2_MODBOX_1',
        'BI_NL2_MODBOX_2',
      ])
    })
    it('flashlampChannelsAll yields box×ch flat list (default 2 channels)', () => {
      expect(pv.flashlampChannelsAll('NL2', ['22', '23'])).toEqual([
        'SI_NL2_FL_22_CH1',
        'SI_NL2_FL_22_CH2',
        'SI_NL2_FL_23_CH1',
        'SI_NL2_FL_23_CH2',
      ])
    })
    it('flashlampChannelsAll with explicit 2 matches the default (byte-identical)', () => {
      expect(pv.flashlampChannelsAll('NL2', ['22', '23'], 2)).toEqual(
        pv.flashlampChannelsAll('NL2', ['22', '23']),
      )
    })
    it('flashlampChannelsAll honors channelsPerBox', () => {
      expect(pv.flashlampChannelsAll('NL2', ['22'], 3)).toEqual([
        'SI_NL2_FL_22_CH1',
        'SI_NL2_FL_22_CH2',
        'SI_NL2_FL_22_CH3',
      ])
    })
  })

  it('LASER_COMMANDS is the closed command vocabulary', () => {
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

  it('respects the laser id for different lasers', () => {
    expect(pv.shutter('NL5')).toBe('BI_NL5_SHUTTER')
    expect(pv.cmd('NL5', 'STOP_LASER')).toBe('CMD_NL5_STOP_LASER')
  })
})
