'use client'

import { FC } from 'react'
import { LaserPanel } from '@/components/hmi/laser-panel'
import { L4_OPCPA_SEQUENCES } from '@/components/hmi/laser-panel/SequencerSection'
import { makeCommandPv, pv } from '../lib/pv-names'
import type { LaserSpec } from '../config/schema'

interface LaserPanelInstanceProps {
  spec: LaserSpec
}

/**
 * Renders one laser column from a {@link LaserSpec}. Every PV name comes from
 * the spec (resolved from `lasers.yaml`); command write targets resolve via
 * `makeCommandPv` (YAML override, else code-built `CMD_<laser>_<NAME>`).
 * Sections whose device bank is empty are omitted: no chillers → no Chillers
 * section, no flashlamps → no Flashlamps, no modbox PVs → no Modbox. General +
 * Regen always render. `commands` gates which action buttons appear.
 */
export const LaserPanelInstance: FC<LaserPanelInstanceProps> = ({ spec }) => {
  const cmdPv = makeCommandPv(spec.laser, spec.commandPvs)
  return (
    <LaserPanel title={spec.laser}>
      {spec.pvs.sequencerRunning && (
        <LaserPanel.Sequencer
          sequencerRunningPv={spec.pvs.sequencerRunning}
          sequences={L4_OPCPA_SEQUENCES.map((s) => ({
            label: s.label,
            statePv: pv.seqState(spec.laser, s.id),
          }))}
        />
      )}
      <LaserPanel.General
        cmdPv={cmdPv}
        connectionPv={spec.pvs.connection}
        fullPowerPv={spec.pvs.fullPower}
        shutterPv={spec.pvs.shutter}
        phdMeanPv={spec.pvs.phdMean}
        mss={spec.mss}
        moduleErrors={spec.moduleErrors}
        commands={spec.commands}
      />
      <LaserPanel.Regen
        regenStatePv={spec.pvs.regenState}
        regenTempPv={spec.pvs.regenTemp}
        phd2MeanPv={spec.pvs.phd2Mean}
        attenuatorPv={spec.pvs.attenuator}
      />
      {spec.chillers.length > 0 && (
        <LaserPanel.Chillers chillers={spec.chillers} />
      )}
      {spec.flashlamps.length > 0 && (
        <LaserPanel.Flashlamps
          cmdPv={cmdPv}
          flashlamps={spec.flashlamps}
          triggerDelay={spec.triggerDelay}
          delayPresets={spec.delayPresets}
          commands={spec.commands}
        />
      )}
      {spec.modbox.length > 0 && (
        <LaserPanel.Modbox
          cmdPv={cmdPv}
          modbox={spec.modbox}
          loadedWaveformPv={spec.pvs.loadedWaveform}
          latestWaveformPv={spec.pvs.latestWaveform}
          mbc1Pv={spec.pvs.modboxMbc1}
          mbc2Pv={spec.pvs.modboxMbc2}
          commands={spec.commands}
        />
      )}
    </LaserPanel>
  )
}
