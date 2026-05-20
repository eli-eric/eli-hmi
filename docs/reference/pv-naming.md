# PV naming

How PV names are written in code, what the wire sees, and which prefixes mean what.

## Logical vs wire names

Code uses *logical* PV names (`MOD1.AI_TEMP`). The frontend WS client applies a per-environment **dev-prefix** via `getPrefixedPV` (`frontend/src/lib/utils/pv-helpers.ts`) at subscribe time and at lookup time. The wire sees the prefixed form (e.g. `DEV:MOD1:AI_TEMP`).

Callers stay in logical names. The hook is the deep module that buries this — see [websocket-client](../frontend/websocket-client.md). The only place this discipline currently breaks is two write call sites that call `getPrefixedPV` themselves (`WarningErrorControl.tsx`, `DropDownStateControl.tsx`).

## Mock-backend prefix conventions

The Go mock infers the value type from a prefix on the **last** name segment:

| Prefix | Type | Default mode | Use |
| --- | --- | --- | --- |
| `AI_*` | float64 | auto-simulate (drift) | Analog Input — pressures, temperatures, RPMs |
| `BI_*` | bool | manual | Binary Input — door open/closed, valve open/closed |
| `SI_*` | string | manual (cycles preset words) | String Input — state labels |
| `CMD_*` | (command) | n/a | L4 OPCPA: write triggers a coordinated effect chain |
| `PV_*` | direct PV | n/a | L4 OPCPA: writable PV that isn't a command |

These conventions are **mock-only**. The real EPICS network does not use them. If you write a page against the mock with `AI_RPM_TURBO`, the same logical name on the python-backend resolves to whatever the EPICS database calls that PV — the dev-prefix is the only convention shared between the two backends.

## L4 OPCPA registry

The laser-control page constructs every PV name through typed builders:

```ts
import { pv } from '@/app/(modules)/l4-opcpa/lib/pv-names'

pv.shutter('NL2')                        // 'BI_NL2_SHUTTER'
pv.flashlampChannel('NL2', '22', '1')    // 'SI_NL2_FL_22_CH1'
pv.cmd('NL2', 'START_LASER')             // 'CMD_NL2_START_LASER'
pv.mssAll('NL2', 6)                      // ['BI_NL2_MSS_1', …, 'BI_NL2_MSS_6']
```

The mock (`backend/mockup-websocket-server/l4_opcpa.go`) hand-mirrors the same name shapes. See [ADR-0006](../adr/0006-pv-name-registry-l4-opcpa.md).

## Deliberate placeholders

`src/lib/modules/<m>.config.ts` files carry placeholder PV names — `undefined1:PRESSURE`, `SI_???`, `AI_RPM_SPEED_P04`, `// TODO PV name unclear`, `// TODO PVs unknown`. These are **deliberate**, not oversights. Control engineers haven't settled on canonical names yet; the refactor preserves the legacy ambiguity rather than inventing names. Replace placeholders only when an engineer has confirmed them. Detail: [`frontend/src/lib/modules/README.md`](../../frontend/src/lib/modules/README.md#deliberate-placeholders).
