/**
 * Command vocabulary for the L4 OPCPA page.
 *
 * Read/write *signal* PV names are NOT built here any more — they are full
 * strings in the zone-referenced runtime YAML (provided by controls). Command
 * write targets are configurable per laser in the same YAML (`commands` map):
 * a real PV there is written directly, optionally with the value to write; a
 * placeholder (value == key) falls back to the assembled **command PV**
 * (`CMD_<laser>_<NAME>`), which triggers a coordinated sequence of writes
 * dispatched by the backend (see backend/mockup-websocket-server/l4_opcpa.go,
 * `sequences`).
 *
 * `LASER_COMMANDS` is the closed vocabulary: the YAML config validates each
 * laser's `commands` keys against it (a zod enum derived from it),
 * `LaserCommand` is derived from it, and `makeCommandPv` resolves the wire
 * name. Adding a brand-new command means editing this tuple AND the backend
 * `sequences` map AND wiring a button.
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

/**
 * Where a command's write goes and what it writes.
 *
 * Field names match `ActionButton`'s props on purpose, so a button is wired
 * with `<ActionButton label="…" {...cmdPv('MODBOX_OFF')} />` and cannot get
 * the PV right while dropping the value.
 */
export interface CommandTarget {
  /** PV the write goes to. */
  pvName: string
  /**
   * Value written. `1` is the trigger convention for the backend's command
   * PVs; a real device PV often wants something else — e.g. MODBOX_OFF writes
   * the string 'Sleep' — which the YAML supplies per command.
   */
  value: number | string
}

/** Resolves a command to its write target. */
export type CommandPvResolver = (name: LaserCommand) => CommandTarget

/**
 * Builds the command→write-target resolver for one laser. `overrides` holds
 * the targets configured in the YAML `commands` map (placeholders already
 * stripped by the schema); anything not overridden falls back to the
 * mock-backend convention `CMD_<laser>_<NAME>` triggered with `1`.
 */
export const makeCommandPv =
  (
    laser: string,
    overrides: Partial<Record<LaserCommand, CommandTarget>>,
  ): CommandPvResolver =>
  (name) =>
    overrides[name] ?? { pvName: pv.cmd(laser, name), value: 1 }

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
