# Workflow: adding a control page

For a *vacuum-system* control page (L3BT, L4fBT, P3 shape). If the page is laser-control-shaped, see [l4-opcpa](../frontend/l4-opcpa.md) — that pattern is deliberately different.

## Steps

### 1. Write the config

`frontend/src/lib/modules/<m>.config.ts`:

```ts
import type { ModuleConfig } from './types'

export const myModuleConfig: ModuleConfig = {
  heading: 'My Module',
  interlocks: {
    title: 'My Module Interlocks',
    checkClearPv: 'MY-MODULE:INTERLOCK',
    items: [
      { pvname: 'MY-MODULE:S1:INTERLOCK', title: 'Volume S1' },
    ],
  },
  safetyPermission: { title: '…', items: [/* … */] },
  cleanDryAir: {
    title: 'My Module CDA',
    volumes: [
      {
        title: 'CDA Valve Actuation',
        pressure: { pvName: 'MY:PPS:PRESSURE', label: 'PPS' },
        flow: { pvName: 'MY:PPS:FLOW', label: 'PFS', options: { format: 'precision' } },
      },
    ],
  },
  backing: { /* SensorGroup + PumpConfig */ },
  roughing: { /* SensorGroup + PumpConfig + optional Locking */ },
}
```

### 2. Add the page

`frontend/src/app/(modules)/<m>-controls/page.tsx`:

```tsx
'use client'
import { ModuleControlPage } from '@/components/module-page/module-control-page'
import { myModuleConfig } from '@/lib/modules/<m>.config'
import { MyVolumes } from './parts/volumes'
import { MyConnector } from './parts/connector'

export default () => (
  <ModuleControlPage
    config={myModuleConfig}
    bottomRow={
      <>
        <MyConnector />
        <MyVolumes />
      </>
    }
  />
)
```

### 3. Build the `parts/`

Anything not data-only (volumes with mixed compound children, connectors with cross-module hyperlinks, etc.) lives in `frontend/src/app/(modules)/<m>-controls/parts/` as React components. Use the compound HMI building blocks — [hmi-components](../frontend/hmi-components.md).

### 4. Register the route in a zone

In every config directory that should expose it, edit `zones/<ZONE_CODE>.yaml`:

```yaml
navigationItems:
  # existing …
  - text: My Module
    href: /<m>-controls
allowedRoutes:
  # existing …
  - /<m>-controls
```

Skip this and Next.js Proxy redirects to `/no-access` even though the page exists. `CONFIG_DIR` selects the config directory and `ZONE_CODE` selects its zone file at runtime; deployments mount the directory read-only at `/app/zone-config`.

The new `ModuleConfig` and bespoke `parts/` are still app code. Runtime module YAML currently supports only L4 OPCPA, so do not add an invented `modules.<m>` key; the strict zone schema rejects unknown module keys.

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
