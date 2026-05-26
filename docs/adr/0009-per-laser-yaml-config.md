# ADR-0009: Per-laser L4 OPCPA topology via a YAML config (zod-validated)

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

Two problems pushed us to externalise it sooner:

- **All five lasers shared one `SHARED` blob.** There was no mechanism for a
  laser to have a different chiller count, flashlamp box set, modbox count, or
  command set — yet the lasers are expected to diverge.
- **Config was code.** Changing topology meant editing TypeScript. The people
  who own laser topology are not necessarily TypeScript developers, and the
  values were spread across `laser-specs.ts` (counts/ids) and `pv-names.ts`
  (name shapes), which read as "PV names generated in odd, scattered ways".

[ADR-0006](0006-pv-name-registry-l4-opcpa.md) had already considered "codegen
from a schema" and deferred it.

## Decision

Per-laser topology lives in a single human-editable YAML file,
`src/app/(modules)/l4-opcpa/config/lasers.yaml`, the **frontend source of
truth**. Each laser is listed explicitly (no shared defaults) with its own
`mssCount`, `modboxCount`, `channelsPerBox`, `chillerIds`, `flashlampBoxes`,
`delayPresets`, `moduleErrors`, and `commands`.

- **Validation: zod.** `config/schema.ts` defines one zod schema that is the
  single source for (a) the `LaserSpec` type the UI consumes, (b) runtime
  validation (`.strict()` rejects unknown keys; a refine enforces that
  `chillerIds` and the `CHILLER_*` entries in `moduleErrors` match; duplicate
  ids are rejected), and (c) `lasers.schema.json`, generated via
  `z.toJSONSchema` (`npm run gen:schema`, guarded by a drift test). The YAML
  references the generated schema with a `# yaml-language-server` line, giving
  editor autocomplete + inline errors.
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
- **Empty banks hide sections.** `chillerIds: []`, `flashlampBoxes: []`, or
  `modboxCount: 0` omit the whole Chillers / Flashlamps / Modbox section for
  that laser. General and Regen always render.

`components/laser-specs.ts` is deleted; `LaserSpec` now comes from
`config/schema.ts`. `loadLaserSpecs()` is the seam ADR-0008 anticipated: when a
`GET /lasers` endpoint exists, swap the `fs` read for a `fetch`.

## Consequences

- **Positive — non-dev editable, single file.** Topology changes are one YAML
  edit with autocomplete and a documented field reference (`config/README.md`).
- **Positive — per-laser divergence.** Each laser is independently configurable;
  zero is a valid count (the subsystem's section disappears).
- **Positive — fail-fast, no drift within the frontend.** Invalid config fails
  the build with operator-readable messages; the chiller cross-check and the
  schema drift test close two classes of silent drift.
- **Negative — config changes need a rebuild** (static prerender). Acceptable:
  current use is dev/test; production topology will come from the gateway.
- **Negative — new deps** (`yaml`, `zod`, `server-only`, dev `tsx`) and a
  generated `lasers.schema.json` to keep in sync (guarded by a test).
- **Unchanged / open — the Go mock is test-only and does not read this YAML.**
  It keeps its own hardcoded constants; adding devices in YAML that the mock
  doesn't seed renders as `<>`. Mirroring is manual, as before (ADR-0006). The
  mock and the frontend agree today because NL1–NL5 are still identical.

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
