/**
 * Canonical L4 OPCPA laser topology for the frontend.
 *
 * Mirror these counts/ids in backend/mockup-websocket-server/l4_opcpa.go
 * (constants block: mssCount, modboxStateCount, chillerIds, flashlampBoxes)
 * when adding or removing PV banks. Drift = the mock seeds the wrong number
 * of PVs vs what the frontend subscribes to.
 *
 * When backend/python-websocket-server starts implementing L4, it becomes
 * the canonical source and this file should be re-derived from its config.
 *
 * Confluence documents only NL2 + APL. NL1/NL3/NL4/NL5 mirror the NL2 shape
 * with the laser id swapped — see Phase 9 footer comment #5 on the source
 * Confluence page for confirmation / divergence requests.
 *
 * Confluence-documented EPICS PV names (informational, for python-backend wiring):
 *  - Regen State        @productionPv SY3PL50M:32
 *  - PHD mean           @productionPv PHD1K000:49/Mean
 *  - Regen Temp         @productionPv TK6:44
 *  - Attenuator         @productionPv SM5:ATT1:51
 *  - Chillers           @productionPv PS1225:11..14 (Flow/Temp/Water)
 *  - Flashlamps         @productionPv PS5059:22..28 Ch1/Ch2
 *  - Trigger Delay      @productionPv PS5059:22 Ch1/Ch2
 *  - Shutter            @productionPv IO:15/RC1,pin31
 */

export interface LaserSpec {
  readonly laser: string
  readonly mssCount: number
  readonly moduleErrors: readonly string[]
  readonly chillerIds: readonly string[]
  readonly boxIds: readonly string[]
  readonly delayPresets: readonly number[]
  readonly modboxStateCount: number
}

const SHARED = {
  mssCount: 6,
  moduleErrors: [
    'REGEN',
    'CHILLER_11',
    'CHILLER_12',
    'CHILLER_13',
    'CHILLER_14',
    'FLASHLAMPS',
  ],
  chillerIds: ['11', '12', '13', '14'],
  boxIds: ['22', '23', '24', '25', '26', '27', '28'],
  delayPresets: [50, 500, 700, 790],
  modboxStateCount: 5,
} as const

export const LASER_SPECS: readonly LaserSpec[] = [
  { laser: 'NL1', ...SHARED },
  { laser: 'NL2', ...SHARED },
  { laser: 'NL3', ...SHARED },
  { laser: 'NL4', ...SHARED },
  { laser: 'NL5', ...SHARED },
] as const
