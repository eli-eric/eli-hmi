# Module configs

Each entry in this folder describes a single control module (L3BT, L4fBT, P3, ...) as a typed `ModuleConfig` (`./types.ts`). The shared `<ModuleControlPage>` (`@/components/module-page/module-control-page`) renders the config plus a bespoke `bottomRow` slot for volumes and connectors.

## Adding a new module

1. **Write a config file** `src/lib/modules/<module>.config.ts`:

   ```ts
   import type { ModuleConfig } from './types'

   export const myModuleConfig: ModuleConfig = {
     heading: 'My Module',

     interlocks: {
       title: 'My Module Interlocks',
       checkClearPv: 'MY-MODULE:INTERLOCK',
       items: [
         { pvname: 'MY-MODULE:S1:INTERLOCK', title: 'Volume S1' },
         // ...
       ],
     },

     safetyPermission: {
       title: 'My Module Machine Safety Permissions',
       items: [/* ... */],
     },

     cleanDryAir: {
       title: 'My Module CDA',
       volumes: [
         {
           title: 'CDA Valve Actuation',
           pressure: { pvName: 'MY:PPS:PRESSURE', label: 'PPS' },
           flow: { pvName: 'MY:PPS:FLOW', label: 'PFS', options: { format: 'precision' } },
         },
         // 1 volume → renders a single Container; 2+ → wrapped in MultiVolumes
       ],
     },

     backing: { /* SensorGroup + PumpConfig */ },
     roughing: { /* SensorGroup + PumpConfig + optional Locking */ },
   }
   ```

2. **Add bespoke parts** under `src/app/(modules)/<module>-controls/parts/` for volumes and connectors. Their PV-to-component wiring is too structural for the config schema — these stay as React components.

3. **Add the page** at `src/app/(modules)/<module>-controls/page.tsx`:

   ```tsx
   'use client'
   import { ModuleControlPage } from '@/components/module-page/module-control-page'
   import { myModuleConfig } from '@/lib/modules/my-module.config'
   import { MyModuleVolumes } from './parts/volumes'
   import { MyModuleConnector } from './parts/connector'

   export default () => (
     <ModuleControlPage
       config={myModuleConfig}
       bottomRow={
         <>
           <MyModuleConnector />
           <MyModuleVolumes />
         </>
       }
     />
   )
   ```

4. **Register the route** in `src/lib/settings/zone-config.ts`:

   ```ts
   {
     navigationItems: [..., { text: 'My Module', href: '/my-module-controls' }],
     allowedRoutes: [..., '/my-module-controls'],
   }
   ```

   Skip step 4 and the middleware will redirect to `/no-access` even though the file exists.

## What goes in the config vs. in `parts/`?

| Lives in config | Lives in `parts/` |
|---|---|
| Interlocks (PV name + title pairs) | Volumes (`MultiVolumes` ribbon, mixed `SensorBar`/`Config`/`Doors`/`MasterKey`/`TurbopumpBasic` children) |
| Safety Permissions | Connectors (`Gate`, `Valve`, `LabelValue`, `ValveStatus`, hyperlinks to other modules) |
| Backing / Roughing / Clean-Dry-Air (sensor lists, pump PVs, optional Locking) | Anything that wires PVs through specific compound children in a non-uniform shape |

The split exists because volumes and connectors have **structural** variance per module (number of sub-volumes, mix of compound children, cross-module `href`s), while the five panel kinds in the config have **data-only** variance (PV names, titles, sensor counts).

## PV names

Pass **logical** PV names. `useWebSocketData` applies the dev-vs-prod prefix (`getPrefixedPV` in `src/lib/utils/pv-helpers.ts`) internally. The mock server expects prefixed names — the production server expects raw names — same source string, both work.

Many config entries today are placeholders (`undefined1:PRESSURE`, `SI_???`, `// TODO PV name unclear`). Update them as the control engineers settle on canonical names.
