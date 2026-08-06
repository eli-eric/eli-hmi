/**
 * Command vocabulary for the L4 OPCPA page.
 *
 * Read/write *signal* PV names are NOT built here any more — they are full
 * strings in the zone-referenced runtime YAML (provided by controls). The one
 * thing still assembled in code is the **command PV**
 * (`CMD_<laser>_<NAME>`): a command is
 * not a single PV, it triggers a coordinated sequence of writes dispatched by
 * the backend (see backend/mockup-websocket-server/l4_opcpa.go, `sequences`).
 *
 * `LASER_COMMANDS` is the closed vocabulary: the YAML config validates each
 * laser's `commands` against it (a zod enum derived from it), `LaserCommand` is
 * derived from it, and `pv.cmd` builds the wire name. Adding a brand-new command
 * means editing this tuple AND the backend `sequences` map AND wiring a button.
 */

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
  /**
   * Command-PV name. `name` is constrained to the LaserCommand union so typos
   * surface at compile time instead of as a 400 from the backend.
   */
  cmd: (laser: string, name: LaserCommand) => `CMD_${laser}_${name}`,
  /**
   * Per-sequence state PV (`BI_<laser>_SEQ_<id>`, 1 = RUNNING, 0 = IDLE).
   *
   * PROOF-OF-CONCEPT: the real control system does not yet expose a state PV
   * per sequence — this is mocked in the backend (l4_opcpa.go) so the expanded
   * Sequencer can demonstrate per-sequence IDLE/RUNNING per the spec. The wire
   * name reuses the command id so firing CMD_<laser>_<id> flips the matching
   * SEQ state PV.
   */
  seqState: (laser: string, id: LaserCommand) => `BI_${laser}_SEQ_${id}`,
} as const
