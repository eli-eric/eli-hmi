/**
 * Canonical PV-name registry for the L4 OPCPA page.
 *
 * Every PV the L4 page reads or writes is constructed via one of these
 * builders. Rename or restructure a PV here and the section components
 * pick it up automatically.
 *
 * Backend hand-mirrors these names (see backend/mockup-websocket-server/l4_opcpa.go);
 * if a name changes here, update the Go file too.
 */

const bi = (laser: string, field: string) => `BI_${laser}_${field}`
const ai = (laser: string, field: string) => `AI_${laser}_${field}`
const si = (laser: string, field: string) => `SI_${laser}_${field}`

/**
 * Command-PV name suffix. Must match a key in the Go backend's `sequences`
 * map (backend/mockup-websocket-server/l4_opcpa.go, lowercased there). Adding
 * a new command = update both this union and the backend map.
 */
// Canonical command vocabulary. Single source: the YAML config validates a
// laser's `commands` against this list (via a zod enum derived from it), and
// `pv.cmd` / the LaserCommand type are derived from it too. Adding a brand-new
// command means editing this tuple AND the Go backend `sequences` map AND
// wiring a button in the relevant section.
export const LASER_COMMANDS = [
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
] as const

export type LaserCommand = (typeof LASER_COMMANDS)[number]

export const pv = {
  // General
  connection: (laser: string) => bi(laser, 'CONN'),
  fullPower: (laser: string) => bi(laser, 'FULLP'),
  shutter: (laser: string) => bi(laser, 'SHUTTER'),
  phdMean: (laser: string) => ai(laser, 'PHD_MEAN'),

  // Regen
  regenState: (laser: string) => bi(laser, 'REGEN_STATE'),
  regenTemp: (laser: string) => `AI_TEMP_${laser}_REGEN`,
  phd2Mean: (laser: string) => ai(laser, 'PHD2_MEAN'),
  attenuator: (laser: string) => ai(laser, 'ATT'),

  // Chillers
  chillerFlow: (laser: string, id: string) => ai(laser, `CHILLER_${id}_FLOW`),
  chillerTemp: (laser: string, id: string) => ai(laser, `CHILLER_${id}_TEMP`),
  chillerLevel: (laser: string, id: string) =>
    ai(laser, `CHILLER_${id}_LEVEL`),

  // Flashlamps
  flashlampChannel: (laser: string, box: string, ch: string) =>
    si(laser, `FL_${box}_CH${ch}`),
  triggerDelay: (laser: string, ch: string) => ai(laser, `TRIG_DELAY_CH${ch}`),

  // Modbox
  modboxState: (laser: string, i: number) => bi(laser, `MODBOX_${i}`),
  loadedWaveform: (laser: string) => si(laser, 'LOADED_WAVEFORM'),

  // Command PVs (any action). `name` is constrained to the LaserCommand union
  // so typos surface at compile time instead of as a 400 from the backend.
  cmd: (laser: string, name: LaserCommand) => `CMD_${laser}_${name}`,

  // Array helpers — concentrate the "loop over N" idiom in one place.
  mssAll: (laser: string, count: number): readonly string[] =>
    Array.from({ length: count }, (_, i) => bi(laser, `MSS_${i + 1}`)),

  moduleErrorsAll: (
    laser: string,
    names: readonly string[],
  ): readonly string[] => names.map((n) => bi(laser, `ERR_${n}`)),

  modboxStateAll: (laser: string, count: number): readonly string[] =>
    Array.from({ length: count }, (_, i) => bi(laser, `MODBOX_${i + 1}`)),

  flashlampChannelsAll: (
    laser: string,
    boxIds: readonly string[],
    channelsPerBox = 2,
  ): readonly string[] => {
    const out: string[] = []
    for (const box of boxIds) {
      for (let ch = 1; ch <= channelsPerBox; ch++) {
        out.push(si(laser, `FL_${box}_CH${ch}`))
      }
    }
    return out
  },
} as const
