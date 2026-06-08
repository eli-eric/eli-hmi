# ADR-0010: Per-laser L4 OPCPA config as full PV names in YAML (zod-validated)

**Status:** Accepted
**Date:** 2026-05-25
**Deciders:** ELI-HMI team (L4 OPCPA workstream)
**Supersedes:** [ADR-0008](0008-laser-specs-location.md); supersedes the read-PV registry of [ADR-0006](0006-pv-name-registry-l4-opcpa.md) (command PVs excepted)

## Context

[ADR-0008](0008-laser-specs-location.md) put per-laser topology in a TypeScript
constant, `LASER_SPECS` in `components/laser-specs.ts`, and explicitly foresaw
that constant being replaced once topology became externally configurable
("when a Python EPICS gateway exposes `GET /lasers`, this static config should
be replaced … the file disappears").

Three problems pushed us to externalise it sooner:

- **PV names were assembled in code, from mock conventions.** Read-PV names were
  built by `pv.*` builders as `<TYPE>_<laser>_<field>` (e.g. `BI_NL2_SHUTTER`).
  Real EPICS names (`SY3PL50M:32`, `TK6:44`, `PS1225:11`…) don't follow that
  shape, so the assembled names could only ever match the mock — controls could
  not supply the real names without a code change. This is the "PV names
  generated in odd, scattered ways" problem.
- **All five lasers shared one `SHARED` blob.** No mechanism for a laser to have
  a different chiller count, flashlamp set, modbox count, or command set — yet
  the lasers are expected to diverge.
- **Config was code.** Changing it meant editing TypeScript, split across
  `laser-specs.ts` (counts/ids) and `pv-names.ts` (name shapes). The people who
  own laser topology are not necessarily TypeScript developers.

[ADR-0006](0006-pv-name-registry-l4-opcpa.md) had already considered "codegen
from a schema" and deferred it.

## Decision

The per-laser config lives in a single human-editable YAML file,
`src/app/(modules)/l4-opcpa/config/lasers.yaml`, the **frontend source of
truth**. Each laser is listed explicitly (no shared defaults) and holds the
**full PV name of every signal** (what controls provides), plus `delayPresets`
and `commands`. The shape: `pvs` (scalar signals — connection, fullPower,
shutter, phdMean, regenState, regenTemp, phd2Mean, attenuator, loadedWaveform),
`triggerDelay` (PV list), `mss` (PV list), `moduleErrors` (`{label, pv}` list),
`chillers` (`{label, flow, temp, level}` list), `flashlamps` (`{label, pv}`
list), and `modbox` (PV list).

- **Validation: zod.** `config/schema.ts` defines one zod schema that is the
  single source for (a) the `LaserSpec` type the UI consumes, (b) runtime
  validation (`.strict()` rejects unknown keys; duplicate ids rejected; commands
  validated against the closed vocabulary), and (c) `lasers.schema.json`,
  generated via `z.toJSONSchema` (`npm run gen:schema`, guarded by a drift
  test). The YAML references the generated schema with a `# yaml-language-server`
  line, giving editor autocomplete + inline errors.
- **Loading: server-side `fs`, at build.** `config/load-laser-specs.ts`
  (`server-only`) reads + parses the YAML. `page.tsx` is a server component
  (the client view holds the WS connection banner), and has no dynamic APIs, so
  Next statically prerenders it — validation runs at `next build` and an
  invalid config **fails the build**. No `.yaml` bundler loader is needed
  (would have meant configuring turbopack + webpack + vitest).
- **Full PV strings, not assembled names.** The config holds the *complete* PV
  name for every signal — the string controls provides (e.g. `SY3PL50M:32`) —
  not pieces glued together in code. This reverses [ADR-0006](0006-pv-name-registry-l4-opcpa.md)'s
  builder approach for *read* PVs: those `pv.*` builders assembled mock-convention
  names (`BI_<laser>_<field>`) that cannot represent real EPICS names, which is
  exactly the "scattered / odd" generation this ADR removes. `pv-names.ts` is
  slimmed to the command vocabulary + `pv.cmd` only (see next point). The file is
  seeded with today's mock names so the mock keeps working; swapping to real
  names is a pure YAML edit.
- **The command vocabulary is closed.** `LASER_COMMANDS` in `pv-names.ts` is the
  canonical list; the zod enum and `LaserCommand` type derive from it. YAML only
  selects which of those commands each laser exposes (buttons for unlisted
  commands are hidden). Adding a brand-new command still needs code + backend.
- **Empty banks hide sections.** `chillers: []`, `flashlamps: []`, or
  `modbox: []` omit the whole Chillers / Flashlamps / Modbox section for that
  laser. General and Regen always render.

`components/laser-specs.ts` is deleted; `LaserSpec` now comes from
`config/schema.ts`. `loadLaserSpecs()` is the seam ADR-0008 anticipated: when a
`GET /lasers` endpoint exists, swap the `fs` read for a `fetch`.

## Consequences

- **Positive — non-dev editable, single file.** Topology changes are one YAML
  edit with autocomplete and a documented field reference (`config/README.md`).
- **Positive — per-laser divergence.** Each laser is independently configurable;
  zero is a valid count (the subsystem's section disappears).
- **Positive — fail-fast.** Invalid config fails the build with operator-readable
  messages; the schema drift test keeps the generated JSON Schema in step with
  the zod source.
- **Negative — config changes need a rebuild** (static prerender). Acceptable:
  current use is dev/test; production topology will come from the gateway.
- **Negative — new deps** (`yaml`, `zod`, `server-only`, dev `tsx`) and a
  generated `lasers.schema.json` to keep in sync (guarded by a test).
- **Unchanged / open — the Go mock is test-only and does not read this YAML.**
  It keeps its own hardcoded constants; a PV name in the YAML that the mock
  doesn't seed renders as `<>`. Mirroring is manual, as before (ADR-0006). The
  mock and the frontend agree today because the YAML is seeded with the mock's
  names.

## Alternatives considered

- **Keep TS config, just split `SHARED` per laser.** Rejected — still code, not
  editable by non-developers, and leaves naming "scattered".
- **JSON instead of YAML.** Rejected — no comments; the self-documenting inline
  comments were a stated requirement.
- **`.yaml` import via a bundler loader.** Rejected — three toolchains
  (turbopack, webpack, vitest) to configure for no runtime benefit.
- **JSON Schema + ajv as the predicate.** Considered — zod was chosen so the TS
  type, runtime validation, and JSON Schema all derive from one definition.
- **Shared config read by the Go mock too.** Rejected for now — the mock is
  test-only; not worth coupling it to the frontend config (see ADR-0006).
