# eli-hmi zone configuration

Per-environment ("zone") configuration for the ELI HMI frontend (CSI-861).
One directory holds runtime-owned deployment data: which pages are reachable,
what shows in the top navigation, and L4 OPCPA's per-laser topology and signal
PV names. The p3/l3bt/l4fbt `ModuleConfig` objects and bespoke parts are still
compiled app code.

**This folder in the app repo is a ready-to-copy template and the current
local-development default.** Creating the separate controls-team git repository
is still a deployment follow-up; when that happens, copy this whole directory
as its initial commit (see [Copying out](#future-copying-out-as-a-standalone-repo)).

No TypeScript knowledge is needed to edit anything here — the files are plain
YAML with editor autocomplete, and every field is documented.

## How it reaches the app

```
┌ config checkout (this layout) ┐        ┌ frontend container ┐
│ zones/test.yaml               │ volume │ CONFIG_DIR=/app/…  │
│ modules/l4-opcpa/…            │ ─────► │ ZONE_CODE=test     │
│ schemas/…                     │ mount  │ reads at startup   │
└───────────────────────────────┘        └────────────────────┘
```

- The deployment **mounts this directory** into the frontend container
  (read-only) and sets two env vars:
  - `CONFIG_DIR` — mount path inside the container (e.g. `/app/zone-config`)
  - `ZONE_CODE` — which zone this deployment is (`test` is the current template)
- The app reads the config **at container start** and caches it.
  **Changing config = commit/pull here + restart the container.**
  No application rebuild, ever.
- A broken or missing config **stops the container at startup** with a
  readable error in the logs — check `docker logs` if the frontend
  crash-loops after a config change. NB: with `restart: unless-stopped` the
  outward symptom is just "the GUI port is dead" — make sure the deploy host
  monitors/alerts on restart-looping containers, otherwise fail-fast is
  invisible to operators.

## Layout & contract

```
zones/<ZONE_CODE>.yaml     one file per zone; the zone code IS the filename stem
                           (case-sensitive; letters, digits, _ and - only)
modules/<module>/…         module config files, referenced from zone files
schemas/*.schema.json      generated — power editor autocomplete; do NOT hand-edit
```

There is **no list of valid zones anywhere in the app** — a `ZONE_CODE` is
valid exactly when `zones/<ZONE_CODE>.yaml` exists. Adding a zone = adding a
file here.

## Zone file format (`zones/*.yaml`)

```yaml
# yaml-language-server: $schema=../schemas/zone.schema.json
schemaVersion: 1            # must match what the app supports — see below

navigationItems:            # top-nav entries, in order
  - text: L4 OPCPA Controls # label shown in the UI
    href: /l4-opcpa         # must also be in allowedRoutes

allowedRoutes:              # reachable pages; FIRST entry = home route
  - /l4-opcpa               # (login redirect + logo link);
                            # everything else redirects to /no-access

modules:                    # config file for each enabled module,
  l4-opcpa:                 # path relative to this directory's root
    config: modules/l4-opcpa/lasers.yaml
```

Validation rules (enforced by the app and by `validate:config`):

- every `navigationItems[].href` must appear in `allowedRoutes`
- no duplicate `allowedRoutes`
- if a module's route is allowed, its `modules.<name>.config` must be set
- unknown keys are rejected (typo protection)

Module routes currently understood by the app: `/l4-opcpa`. Other GUIs
(p3/l3bt/l4fbt vacuum controls) are not yet zone-configurable; their slots
will appear under `modules:` as they are migrated.

The final production zone names (including whether `test` becomes `TESTZ`)
have not been chosen. Zone codes are case-sensitive; keep using `test` for the
checked-in template until deployment naming is agreed.

Module config formats are documented next to the files —
see [modules/l4-opcpa/README.md](modules/l4-opcpa/README.md).

### `schemaVersion`

Each app build supports exactly **one** zone-file schema version (currently
`1`). When a future app version changes the config shape, it will bump the
version, and the release notes will say so. **Deploy the matching config and
app image together**; a version mismatch stops the container at startup with
a message naming the expected version.

## Editing

Use an editor with the YAML extension (e.g. VS Code — "YAML" by Red Hat).
The `# yaml-language-server: $schema=…` first line of each file wires up
**autocomplete and inline validation** against `schemas/`.

Before deploying, validate the whole directory (from a checkout of the app
repo, `frontend/`):

```bash
npm run validate:config -- --dir /path/to/this/directory --all
```

This runs the app's real validation — including cross-checks the editor
cannot do (duplicate PV names, nav/route consistency, module file
resolution).

## Future: copying out as a standalone repo

1. Copy this whole directory as the initial commit of the new repo.
2. Add CI validation — see [`ci-example.yml`](ci-example.yml). Set
   `APP_REPO_REF` to an explicit compatible app release tag or commit SHA; the
   example intentionally has no moving-branch default. The job checks out that
   exact app version and runs `validate:config` against this repo.
3. Point deployments' volume mounts at a clone of the new repo (see
   `deployments/zones/testz/docker-compose.yml` in the app repo for the
   wiring: `CONFIG_DIR` env + read-only mount, readable by uid 1001).
4. In the app repo, `frontend/`'s dev fallback keeps using the in-repo copy
   of this directory (`../eli-hmi-config`) — the app repo's copy then serves
   as the dev fixture + template only; deployment truth lives in the new repo.

### Keeping `schemas/` up to date

`schemas/*.schema.json` are **generated from the app's zod schemas**
(`npm run gen:schema` in the app repo, drift-tested there). They only serve
editor tooling here. When the app updates its schemas (e.g. a new module slot
or a `schemaVersion` bump), re-copy the generated files from the matching app
release.
