'use client'

import { FC } from 'react'
import { LaserPanel } from '@/components/hmi/laser-panel'
import { makeCommandPv } from '../lib/pv-names'
import type { LaserSpec } from '../config/schema'

interface LaserPanelInstanceProps {
  spec: LaserSpec
}

/**
 * Renders one laser column from a {@link LaserSpec}. Every PV name comes from
 * the spec (resolved from the zone's laser config); command write targets resolve via
 * `makeCommandPv` (YAML override, else code-built `CMD_<laser>_<NAME>`).
 * Sections whose device bank is empty are omitted: no chillers → no Chillers
 * section, no flashlamps → no Flashlamps, no modbox PVs → no Modbox. General +
 * Regen always render, minus any row whose PV this laser does not have.
 * `commands` gates which action buttons appear, and `labels` what each row is
 * called — both come from the spec, so one laser's hardware never names
 * another's.
 */
export const LaserPanelInstance: FC<LaserPanelInstanceProps> = ({ spec }) => {
  const cmdPv = makeCommandPv(spec.laser, spec.commandTargets)
  return (
    <LaserPanel title={spec.laser}>
      {spec.sequences.length > 0 && (
        <LaserPanel.Sequencer
          label={spec.labels.sequencer}
          sequences={spec.sequences.map((s) => ({
            label: s.label,
            statePv: s.pv,
          }))}
        />
      )}
      <LaserPanel.General
        cmdPv={cmdPv}
        connectionPv={spec.pvs.connection}
        fullPowerPv={spec.pvs.fullPower}
        shutterPv={spec.pvs.shutter}
        phdMeanPv={spec.pvs.phdMean}
        units={spec.units}
        format={spec.format}
        mss={spec.mss}
        moduleErrors={spec.moduleErrors}
        commands={spec.commands}
        labels={spec.labels}
      />
      <LaserPanel.Regen
        cmdPv={cmdPv}
        commands={spec.commands}
        regenStatePv={spec.pvs.regenState}
        regenTempPv={spec.pvs.regenTemp}
        phd2MeanPv={spec.pvs.phd2Mean}
        attenuatorPv={spec.pvs.attenuator}
        units={spec.units}
        format={spec.format}
        labels={spec.labels}
      />
      {spec.chillers.length > 0 && (
        <LaserPanel.Chillers
          chillers={spec.chillers}
          units={spec.units}
          format={spec.format}
        />
      )}
      {spec.flashlamps.length > 0 && (
        <LaserPanel.Flashlamps
          cmdPv={cmdPv}
          flashlamps={spec.flashlamps}
          triggerDelay={spec.triggerDelay}
          units={spec.units}
          format={spec.format}
          delayPresets={spec.delayPresets}
          commands={spec.commands}
          labels={spec.labels}
        />
      )}
      {/* All of it or none of it: a Modbox is one device, so a laser that has
          one shows every row, and a laser without one has no section. The
          schema requires `loadedWaveform` alongside `modbox`; the check here
          is what narrows the type. */}
      {spec.modbox.length > 0 && spec.pvs.loadedWaveform && (
        <LaserPanel.Modbox
          cmdPv={cmdPv}
          modbox={spec.modbox}
          loadedWaveformPv={spec.pvs.loadedWaveform}
          latestWaveformPv={spec.pvs.latestWaveform}
          waveformsUrl={spec.waveformsUrl}
          units={spec.units}
          mbc1Pv={spec.pvs.modboxMbc1}
          mbc2Pv={spec.pvs.modboxMbc2}
          commands={spec.commands}
          format={spec.format}
          labels={spec.labels}
        />
      )}
    </LaserPanel>
  )
}
