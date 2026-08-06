# Module configuration

Zone files reference module data by paths relative to the config-directory
root. A reference makes CI and production startup validate the file; it does
not expose the module's route.

- `l4-opcpa/lasers.yaml` uses the laser-specific schema documented in that
  directory.
- `p3/config.yaml`, `l3bt/config.yaml`, and `l4fbt/config.yaml` use
  `../../schemas/module-config.schema.json` (wired by each file's
  `yaml-language-server` header).

The vacuum-module YAML contains only the data consumed by the shared
`ModuleControlPage`. Their bespoke volume/connector trees remain TSX in the
app because that wiring is structural.

Some PV values and duplicate entries are explicitly marked as legacy
placeholders. They were preserved exactly during the TypeScript-to-YAML
migration; replace them only after controls confirms canonical names.
