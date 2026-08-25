# Workflow: adding a control page

For a *vacuum-system* control page (L3BT, L4fBT, P3 shape). If the page is laser-control-shaped, see [l4-opcpa](../frontend/l4-opcpa.md) — that pattern is deliberately different.

## Steps

### 1. Write the config

`modules/<m>/config.yaml` in the runtime config directory:

```yaml
schemaVersion: 1
heading: My Module
interlocks:
  title: My Module Interlocks
  checkClearPv: MY-MODULE:INTERLOCK
  items:
    - pvname: MY-MODULE:S1:INTERLOCK
      title: Volume S1
safetyPermission:
  title: My Module Machine Safety Permissions
  items:
    - pvname: MY-MODULE:S1:PERMISSION
      title: Volume S1 Roughing
cleanDryAir:
  title: My Module CDA
  volumes:
    - title: CDA Valve Actuation
      pressure: { pvName: MY:PPS:PRESSURE, label: PPS }
      flow:
        pvName: MY:PPS:FLOW
        label: PFS
        options: { format: precision }
backing:
  title: My Module Backing
  sensorBar:
    title: Backing Line
    label: Pressure
    sensorPVs: [{ pvName: MY:BACKING:PRESSURE, label: APG1 }]
  pump:
    title: Backing Pump
    rpmPV: MY:BACKING:RPM
    valvePv: MY:BACKING:VALVE
    valveLabel: GV1
roughing:
  title: My Module Roughing
  sensorBar:
    title: Roughing Line
    label: Pressure
    sensorPVs: [{ pvName: MY:ROUGHING:PRESSURE, label: APG2 }]
  pump:
    title: Roughing Pump
    rpmPV: MY:ROUGHING:RPM
    valvePv: MY:ROUGHING:VALVE
    valveLabel: GV2
```

The schema is strict and uses the existing camelCase field names. Keep
unconfirmed placeholders/TODO comments explicit; do not invent PVs during a
format migration.

### 2. Add the page

Use a dynamic server entry so config is read from the running container:

```tsx
import { loadModuleConfig } from '@/lib/modules/module-config-loader'
import { MyModuleView } from './my-module-view'

export const dynamic = 'force-dynamic'

export default function MyModulePage() {
  return <MyModuleView config={loadModuleConfig('my-module')} />
}
```

Put the client composition in `my-module-view.tsx`:

```tsx
'use client'

import { ModuleControlPage } from '@/components/module-page/module-control-page'
import type { ModuleConfig } from '@/lib/modules/types'
import { MyVolumes } from './parts/volumes'
import { MyConnector } from './parts/connector'

export function MyModuleView({ config }: { config: ModuleConfig }) {
  return (
    <ModuleControlPage
      config={config}
      bottomRow={
        <>
          <MyConnector />
          <MyVolumes />
        </>
      }
    />
  )
}
```

### 3. Build the `parts/`

Anything not data-only (volumes with mixed compound children, connectors with cross-module hyperlinks, etc.) lives in `frontend/src/app/(modules)/<m>-controls/parts/` as React components. Use the compound HMI building blocks — [hmi-components](../frontend/hmi-components.md).

### 4. Register the route in a zone

First add the new key/route to `MODULE_ROUTES`, the `ModuleConfigKey` registry,
and the exhaustive module parser registry. TypeScript then forces every
runtime validation path to understand the key.

In every applicable config directory, reference the data file. Add the route
and nav item only to zones that should expose the page:

```yaml
modules:
  my-module:
    config: modules/my-module/config.yaml
navigationItems:
  # existing …
  - text: My Module
    href: /<m>-controls
allowedRoutes:
  # existing …
  - /<m>-controls
```

The module reference makes startup/CI validate the file; it does not grant
route access. Skip `allowedRoutes` and Next.js Proxy redirects to `/no-access`
even though the page exists. `CONFIG_DIR` selects the config directory and
`ZONE_CODE` selects its zone file at runtime; deployments mount the directory
read-only at `/app/zone-config`.

### 5. Test it

```bash
npm test                # vitest watch
npm run dev             # localhost:8082
npm run validate:config -- --dir ../eli-hmi-config --all
```

Hit the new page; subscribe traffic should appear in the network panel.

### 6. Mock PVs if needed

For PV names that don't exist on the mock backend by prefix convention, set them by hand:

```bash
curl http://localhost:8080/pv/AI_PRESSURE/0.1
curl http://localhost:8080/pv/BI_INTERLOCK/true
```

### 7. Add coverage

`src/components/module-page/**` is inside the [coverage gate](../frontend/overview.md#coverage-gate). Add tests for new panel renderings and edge cases.

## Reusing what's there

| You want… | Reach for… |
| --- | --- |
| To render a panel of interlocks | `interlocks` in `ModuleConfig` |
| To render a sensor bar | `backing.sensorBar` / `roughing.sensorBar` |
| A pump readout with RPM + valve | `backing.pump` / `roughing.pump` |
| A CDA volume row | `cleanDryAir.volumes[]` |
| A bespoke volume layout (anything non-uniform) | A React component in `parts/`, composed from `VolumePanel.*` |
| A connector / valve diagram | `ConnectorLine.*` in `parts/` |

See [module-pages](../frontend/module-pages.md) and the canonical [`src/lib/modules/README.md`](../../frontend/src/lib/modules/README.md).
