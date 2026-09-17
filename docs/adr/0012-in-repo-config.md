# ADR-0012: Configuration lives in the app repo and ships inside the image

**Status:** Accepted
**Date:** 2026-09-11
**Deciders:** ELI-HMI team, controls team
**Supersedes:** [ADR-0011](0011-runtime-zone-config.md) — its mounted `CONFIG_DIR`
delivery, its one-file-per-zone layout, and its startup fail-fast. Restores the
build-time delivery of [ADR-0010](0010-per-laser-yaml-config.md), whose YAML +
zod format decision stands.

## Context

ADR-0011 moved zone + module config out of the build: a git repo owned by the
controls team, cloned onto each deploy host and mounted into the container at
`CONFIG_DIR`, read with `readFileSync` at startup. The goal was for the controls
team to own config content without app-repo access, decoupled from app builds.

That decoupling never happened. **The standalone config repo was never
created.** `eli-hmi-config/` in this repo remained "a ready-to-copy template and
the current local-development default", and every deployment mounted a clone of
*this* repo's directory. So the full price of the split was being paid while
none of its benefit was being collected:

- an extra volume mount per station, and a second checkout to keep in sync
- config validated only when a container booted, not when a change was made
- worst, the failure mode: a broken config called `process.exit(1)`, and with
  `restart: unless-stopped` the operator-visible symptom is "the GUI port is
  dead". The config README had to ask deploy hosts to alert on restart-looping
  containers, because fail-fast was otherwise invisible.

Meanwhile the premise changed: **the controls team is taking over this
repository**, so "owns the config without app-repo access" is no longer a
requirement. A config change being a PR plus a redeploy was confirmed
acceptable — config does not change often.

A second requirement arrived with it: the app will run on several machines
against **different PVs**, so a module's config must be able to differ per zone.

## Decision

Config moves back into the repo and is baked into the image.

- **Layout.** One global file, `frontend/config/global.yaml`, plus one config
  directory per module, next to that module's schema and loader:

  ```
  frontend/config/global.yaml
  frontend/src/app/(modules)/<module>/config/zones/<ZONE_CODE>.yaml
  ```

- **The global file only says which modules a zone turns on**, in menu order:

  ```yaml
  zones:
    test:
      title: L4 OPCPA
      modules:
        - { key: l4-opcpa, text: L4 OPCPA Controls }
  ```

  `navigationItems`, `allowedRoutes` and `modules` were three lists saying the
  same thing, kept consistent by three `superRefine` cross-checks. They collapse
  into one: the route comes from the `MODULES` registry in `zone-schema.ts`
  (so it cannot be misspelled), the first entry is the home route, and an entry
  without `text` is reachable but hidden from the menu. All three cross-checks
  are gone because there is nothing left to cross-check.

  This costs the ability to allow a route that is not a module route. Every
  page under the zone gate is a module page today (`/`, `/no-access`,
  `/auth/signin` bypass `proxy.ts` outright), so nothing uses it; an
  `extraRoutes:` key is the seam if that changes.

- **Per-zone module config by convention, with no fallback.** A module's file
  for a zone is `<module>/config/zones/<ZONE_CODE>.yaml`. A zone that enables a
  module must ship that module's file. There is deliberately no shared default
  to fall back to: silently serving another station's PV names is worse in a
  control system than failing the build.

- **`ZONE_CODE` stays the only per-deployment knob.** All zones are in the
  image, so switching a station between existing zones is still a compose edit
  plus a restart — no rebuild. `CONFIG_DIR` is gone; paths are code constants
  rooted at `process.cwd()`, which is the frontend project directory under
  `next dev`, `next start`, vitest, and the standalone server (whose `server.js`
  does `process.chdir(__dirname)` onto the Dockerfile's `WORKDIR /app`).

- **Validation moves to build time.** `npm run validate:config` runs as
  `prebuild`, so broken config fails `next build` instead of a container. It
  checks the global file, that every enabled module has its file, and that
  **every** module YAML on disk parses — including files for zones not rolled
  out yet and modules no zone enables. It prints the full zone → module → file
  resolution, because with the mapping now expressed as a directory layout,
  "which config does this station get" must stay answerable in one command.

- **`schemaVersion` is dropped** from the global and module formats. It existed
  to catch config written for a different app version; config and schema now
  ship in the same commit, so that state is unreachable, and a format change is
  caught by `validate:config` in the very PR that makes it.

- **Startup no longer exits.** `instrumentation.ts` still validates and logs a
  summary, but the only failure it can still hit is a `ZONE_CODE` naming no
  zone — a deployment-env typo. It reports that loudly, names the valid zones
  (possible for the first time, now that the app knows the zone list), and
  keeps serving `/no-access`. A diagnosable UI beats an invisible crash-loop.

- **Tracing.** `next.config.ts` lists the YAML in `outputFileTracingIncludes`;
  a path computed from `ZONE_CODE` is not statically analysable, so tracing
  cannot find these files on its own.

## Consequences

- Positive: no mount, no second checkout, no `CONFIG_DIR`. A station needs an
  image and one env var.
- Positive: config is validated in the PR that changes it, by the same zod
  schemas the app runs — the failure surface moves from deploy back to CI.
- Positive: a module's PV set can differ per zone without any merge semantics,
  since a whole file is selected rather than layered.
- Positive: the path-traversal and symlink guards in the loader are gone —
  module paths are code constants, not config input, so there is no untrusted
  path to sanitise.
- Negative: changing config means a rebuild and a redeploy, not a `git pull`
  plus a restart. Accepted: the controls team owns the repo, and config changes
  are rare.
- Negative: adding a zone means adding a file per enabled module, with no
  default to inherit. That is the point, but it does make a new zone more work
  than a one-line entry.
- Negative: the standalone image now contains a few paths under `src/` that
  hold nothing but YAML — the cost of co-locating config with each module.
- Note: `outputFileTracingIncludes` patterns are matched at **any depth**, so a
  broad pattern also traced the loader's test fixtures into the production
  image. Test config roots are therefore built in temp dirs at run time rather
  than checked in (`src/test/config-root.ts`). If a checked-in file ever needs
  the name `config/global.yaml` again, re-check what lands in
  `.next/standalone`.
- Note: module pages stay `force-dynamic`. Content depends on
  `zones/<ZONE_CODE>.yaml` and `ZONE_CODE` is runtime-only, so prerendering
  would have to pin one zone and break "one image for every station".

## Alternatives considered

- **Keep the mount, just stop using a second repo.** Rejected — it keeps the
  volume, the runtime-only validation and the crash-loop failure mode, which
  are the actual complaints.
- **Import the YAML at build time into the JS bundle.** Rejected for now — it
  needs a Turbopack loader rule plus matching vitest plumbing, and rewrites
  every loader and test, to replace an fs read that already works. The loader
  is the seam if this changes.
- **Name the per-zone file in `global.yaml`** (`config: lasers.l4.yaml`).
  Rejected — it reintroduces per-zone repetition of the module→file mapping
  just deleted, and a free-string path can be misspelled. Convention keeps the
  answer in the module's own directory.
- **Fall back to a shared default file when a zone has none.** Rejected — see
  above; a missing file must fail, not silently resolve to other PVs.
- **A central `frontend/config/modules/` tree instead of co-location.**
  Rejected — the controls team asked for each module's config to sit with the
  module.
