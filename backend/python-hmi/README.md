# Server-rendered HMI (Python only)

One Python process that is both the operator interface and the EPICS gateway. It
renders screens as plain HTML from Jinja templates and pushes live PV updates to
the browser as HTML fragments over Server-Sent Events, using
[Datastar](https://data-star.dev/). No Node, no bundler, no WebSocket protocol
between halves.

**Status: draft.** Functionality is complete and tested; the visual result has
not been reviewed against the React app side by side.

## Three folders, three audiences

```
zones/          what each station shows          ← controls engineers live here
components/     the pieces a screen is made of   ← whoever adds a new kind of piece
core/           how any of it reaches a browser  ← rarely touched
```

- **[zones/](zones/README.md)** — one folder per control-system zone, one folder
  per screen inside it. A folder *is* a screen: creating one adds a route and a
  menu entry, deleting one removes them. Screens are YAML.
- **[components/](components/README.md)** — `value`, `group`, `grid`, `tally`,
  `motor`, `valve`, `panel`, and the bespoke `laser-panel`. Python, written once,
  used from YAML any number of times.
- **core/** — zone resolution, the EPICS hub, severity and rendering, the
  routes. See `core/__init__.py`.

Plus **[ioc/](ioc/README.md)** — a real local EPICS IOC, generated from what the
components declare, so a screen can be developed against real Channel Access.

## Quick start

```bash
cd backend/python-hmi
pip install -r requirements.txt
make run                  # ZONE_CODE=TESTZ, built-in simulator, :8082
```

Open <http://localhost:8082>. Three screens in the menu: **L4 OPCPA** (the
bespoke laser panel), **Chillers** and **Vacuum** (both pure YAML, no Python
written for them). Values move, alarms appear, buttons write.

Against a **real EPICS IOC on your own machine** — same Channel Access, same
`aioca` code path as the hall, nothing simulated in Python:

```bash
pip install -r requirements-epics.txt -r ioc/requirements.txt   # make install-ioc
python ioc/generate.py    # db + the TESTZ-IOC zone, from the components
make ioc                  # a real IOC on CA port 5064
make run-ioc              # the HMI against it
```

Against the control system, on a station in a zone:

```bash
python -m core            # zone from the hostname; see zones/README.md
```

Tests: `make test` (241 tests, ~8 s — the end-to-end ones run a real uvicorn
socket, because the thing under test is a streaming response).

## Adding a screen

```bash
mkdir zones/01/chillers
cp zones/TESTZ/chillers/gui.yaml zones/01/chillers/
$EDITOR zones/01/chillers/gui.yaml      # change the PV names
make run ZONE_CODE=01
```

That is the whole loop: no Python, no route, no registry, no menu to update. The
screen works against the simulator immediately, because the components it uses
declare what their PVs are — and for the same reason `python ioc/generate.py`
gives it a real EPICS database too.

[zones/README.md](zones/README.md) has the details, including the YAML traps
(`OFF` is a boolean) and what `range:` and `alarm:` are for.

## Adding a new kind of piece

[components/README.md](components/README.md). A component is a folder with a
Python file and a template: a name, a pydantic `Config` (which is its
documentation and its error messages), a `setup()` that declares the live parts,
and a `pv_specs()` that says what each PV is. `components/valve/` is the
smallest one; copy it.

## How a value reaches the screen

```
EPICS ──camonitor──▶ PvHub ──invalidates──▶ render loop ──SSE──▶ browser
        (aioca)      cache                  re-renders only
                       │                    the affected widgets
                       └──▶ page render (first paint already has values)
```

1. **`core/epics/`** holds the monitors. One per distinct (PV, datatype) —
   `PvId` carries both, because an enum record read natively delivers its index
   and read as `enum_string` delivers its state name, and a screen needs
   different ones in different places. The hub ref-counts, caches, and hands out
   *invalidations* rather than values.
2. **A component** declares widgets: for each live part, its DOM `id`, the PVs
   it reads, and how to turn readings into a template context.
3. **`core/page.py`** keeps the reverse index (PV → widgets) and renders —
   either the whole screen, or just the widgets a change touched.
4. **`core/routes.py`** runs the loop: wait for a change, let the burst settle
   for `RENDER_INTERVAL`, re-render the touched widgets, push one
   `datastar-patch-elements` event.

One renderer serves both paths, so a cell pushed over SSE is byte-identical to
the cell the page was rendered with. There is a test for exactly that
(`test_patch_markup_matches_what_the_page_rendered`).

### Widget granularity

A widget is a **value cell, pill or list — never a row**. Labels, cog buttons,
inputs and preset chips are rendered once and never patched, so a patch cannot
land in the middle of an operator typing a setpoint or close a panel they just
opened. Expandable regions are always rendered and shown/hidden client-side by a
Datastar signal.

One widget per *screen* would repaint everything whenever any of forty PVs
twitched; one per *PV* would mean hundreds of ids. A cell is the unit an
operator reads, and also the unit that changes.

### Colour

- components own **geometry**; they emit `data-tone-surface` ("I am the element
  that paints") and `data-tone` ("this is the tone");
- `core/static/css/hmi.css`'s tone layer owns **colour**;
- `core/render/severity.py` is the only thing that decides *which* tone applies
  — transport loss > EPICS severity > a component's own emphasis.

So a component cannot invent its own red, and a "this is good" emphasis can
never paint over an alarm.

## Writes

Every control posts to one endpoint, in one of two forms:

```html
data-on:click="@post('/api/write?pv=…&value=1')"          <!-- fixed value -->
data-on:click="@post('/api/write?pv=…&signal=nl2_set')"   <!-- operator's value -->
```

`@post` sends every Datastar signal with the request, so the second form only
has to name which signal carries the value. The response is SSE events that
patch the status line.

A component builds both from its `actions:` and `setpoint:` config — see
`components/templates/rows.html`. A *command* PV is a trigger: the control system
turns one press into a coordinated chain of writes, and a component declares that
chain once (`PvSpec(command=True, effects=…)`) for both the simulator and the
local IOC.

## Two kinds of "disconnected"

Two failures with two different operator responses, so two sentences:

- **`#link-banner`** — the *server* cannot reach EPICS. Channel Access has no
  session to query, so the hub judges it the way an operator would: the link is
  down when it is monitoring PVs and **not one of them** currently has a usable
  reading (a gateway restart disconnects every channel at once; one dead IOC does
  not, and shows as `PV DSC` on its own rows). Pushed on the heartbeat; every
  readout greys out and keeps its last value.
- **the `$_age` watchdog** — the *browser* is no longer receiving the stream.
  `data-on-interval` counts seconds, every heartbeat resets it, and the banner
  appears past 6. Without it a frozen page looks exactly like a quiet machine.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `ZONE_CODE` | *(from the hostname)* | Which `zones/<code>/` to serve |
| `EPICS_BACKEND` | `sim` | `sim` (built-in simulator) or `aioca` (real network) |
| `PORT` / `HOST` | `8082` / `0.0.0.0` | Same port the React app used |
| `RENDER_INTERVAL` | `0.15` | Seconds a burst of updates is collected before one render |
| `HEARTBEAT_SECONDS` | `2.0` | Stream heartbeat; must stay well under the watchdog's 6 s |
| `PREWARM` | `1` | Hold the screens' monitors for the process lifetime, so the first render has real values |
| `PALETTE` | — | `l4-goggles` repaints every negative indication in a colour that survives the L4 hall's safety goggles |
| `SIM_TICK_SECONDS` | `1.0` | Simulator update rate |
| `SIM_SEED` | `1` | Fixed seed keeps a demo reproducible; set empty for fresh noise |
| `ZONES_ROOT` | `zones/` | Where the zone folders live |
| `DEV` | `0` | Reload templates on every render |
| `LOG_LEVEL` | `INFO` | |

Channel Access reads its own environment too (`EPICS_CA_ADDR_LIST`,
`EPICS_CA_AUTO_ADDR_LIST`); nothing here overrides it.

Operational endpoints: `/health/live`, `/health/ready` (503 until the hub is
up), `/stats` (screens, widget and PV counts, monitor and stream counts, and how
the zone was resolved).

## What replaced what

| MVP | Here |
| --- | --- |
| Next.js app, React components, CSS Modules | Jinja templates + one stylesheet (`core/static/css/hmi.css`) |
| `useWebSocketData` subscribing per component | server-side subscription + render loop (`core/routes.py`) |
| WebSocket `/ws/pvs` carrying JSON values | SSE `/<screen>/stream` carrying rendered HTML |
| `websocket_pv_manager.py` fan-out | `core/epics/hub.py` |
| `severity.ts`, `severity-presentation.ts`, `pv-tooltip.ts` | `core/render/severity.py` |
| `Values.tsx` readout primitives | `core/render/readouts.py` |
| `pv-helpers.ts`, `format.ts`, `units.ts` | `core/render/formatting.py` |
| `config/schema.ts` (zod) | each component's `Config` (pydantic) |
| `MODULES` registry + `src/proxy.ts` route enforcement | the zone's folder listing |
| Go mock server (`l4_opcpa.go`) | `core/epics/sim_backend.py`, seeded from `pv_specs()` |
| `backend/epics` hand-written IOC database | `ioc/` — generated from `pv_specs()` |
| `POST /pv/<NAME>` | `POST /api/write` |

## Known gaps in this draft

- **Not visually reviewed.** The CSS is a faithful port of the React CSS
  Modules, but nobody has put the two side by side. Expect spacing to need a
  pass.
- **No authentication.** The React app used NextAuth + LDAP and both backends
  required a JWT on the WebSocket. Nothing here checks anything, so `/api/write`
  is open to whoever can reach the port.
- **The vacuum modules from the React app** (`p3`, `l3bt`, `l4fbt`) are not
  ported. They would be `panel` + `value` + `group` screens, or a component of
  their own if the volume/connector layout is worth one.
- **CSS Modules' scoping is gone** — class names are global and kebab-case.
- **The `l4-goggles` palette** is selected by `PALETTE=l4-goggles`, not yet by
  an operator-facing control.
- **No metadata tier for units/precision.** Subscriptions run at `FORMAT_TIME`,
  which carries severity, status and timestamp but not EGU or PREC, so units
  come from the config. `resolve_units`/`resolve_format` already have the slot.
- **A cog panel closes on press, not on success**, and `Escape` closes it but an
  outside click does not.
