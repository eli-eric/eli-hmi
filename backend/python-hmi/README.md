# Server-rendered HMI (Python only)

One Python process that is both the operator interface and the EPICS gateway.
It renders the **L4 OPCPA** page — a port of
[`frontend/src/app/(modules)/l4-opcpa`](../../frontend/src/app/(modules)/l4-opcpa) —
as plain HTML from Jinja templates, and pushes live PV updates to the browser as
HTML fragments over Server-Sent Events using
[Datastar](https://data-star.dev/).

**Status: draft.** The functionality is complete and tested; the visual result
has not been reviewed against the React app side by side.

## Quick start

```bash
cd backend/python-hmi
pip install -r requirements.txt
ZONE_CODE=demo EPICS_BACKEND=sim python -m app     # or: make run-demo
```

Open <http://localhost:8082>. No IOC, no Node, no build step — the simulator
seeds every PV the page references from the same YAML config the page reads.

Against a **real EPICS IOC on your own machine** — same Channel Access, same
`aioca` code path as the hall, nothing simulated in Python:

```bash
pip install -r requirements-epics.txt -r ioc/requirements.txt   # make install-ioc
python ioc/run_ioc.py            # make ioc       — a real IOC, generated from the config
make run-ioc                     # the HMI against it (ZONE_CODE=ioc EPICS_BACKEND=aioca)
```

See [ioc/README.md](ioc/README.md): the database is generated from the same zone
YAML the page reads, the readouts move because `calc` records are scanning, the
alarms are real EPICS alarms, and a command press runs a `seq` record inside the
IOC. Against the real control system it is the same command with
`ZONE_CODE=test`:

```bash
ZONE_CODE=test EPICS_BACKEND=aioca python -m app   # or: make run-epics
```

Tests: `make test` (128 tests, ~7 s — the end-to-end ones run a real uvicorn
socket, because the thing under test is a streaming response).

## What replaced what

| MVP | Here |
| --- | --- |
| Next.js app, React components, CSS Modules | Jinja templates + one stylesheet (`app/static/css/hmi.css`) |
| `useWebSocketData` subscribing per component | server-side subscription + render loop (`modules/l4_opcpa/routes.py`) |
| WebSocket `/ws/pvs` carrying JSON values | SSE `/l4-opcpa/stream` carrying rendered HTML |
| `websocket_pv_manager.py` fan-out | `app/epics/hub.py` |
| `severity.ts`, `severity-presentation.ts`, `pv-tooltip.ts` | `app/presentation/severity.py` |
| `Values.tsx` readout primitives | `app/presentation/readouts.py` |
| `pv-helpers.ts`, `format.ts`, `units.ts` | `app/presentation/formatting.py` |
| `config/schema.ts` (zod) | `modules/l4_opcpa/config.py` (pydantic) |
| Go mock server (`l4_opcpa.go`) | `app/epics/sim_backend.py` + `modules/l4_opcpa/sim_seed.py` |
| `backend/epics` hand-written IOC database | `ioc/` — generated from the zone config |
| `POST /pv/<NAME>` | `POST /api/write` |

The zone YAML format is **unchanged**, deliberately: `config/zones/test.yaml` is
a copy of the React app's file, so a zone can be moved over without an operator
editing anything.

## How a value reaches the screen

```
EPICS ──camonitor──▶ PvHub ──invalidates──▶ render loop ──SSE──▶ browser
        (aioca)      cache                  re-renders only
                       │                    the affected widgets
                       └──▶ page render (first paint already has values)
```

1. **`app/epics/`** holds the monitors. One per distinct (PV, datatype) —
   `PvId` carries both, because an mbbi record read natively delivers its index
   and read as `enum_string` delivers its state name, and the panel needs
   different ones in different places. The hub ref-counts, caches, and hands out
   *invalidations* rather than values.
2. **`modules/l4_opcpa/widgets.py`** is the registry: for each live part of the
   page, its DOM `id`, the PVs it reads, and how to turn readings into a template
   context. This is what `useWebSocketData` used to do, moved to the server.
3. **`modules/l4_opcpa/view.py`** keeps the reverse index (PV → widgets) and
   renders — either the whole page, or just the widgets a change touched.
4. **`routes.py`** runs the loop: wait for a change, let the burst settle for
   `RENDER_INTERVAL`, re-render the touched widgets, push one
   `datastar-patch-elements` event.

One renderer serves both paths, so a cell pushed over SSE is byte-identical to
the cell the page was rendered with. There is a test for exactly that
(`test_patch_markup_matches_what_the_page_rendered`).

### Widget granularity

A widget is a **value cell, pill or list — never a row**. Labels, cog buttons,
inputs and preset chips are rendered once and never patched, so a patch cannot
land in the middle of an operator typing a setpoint or close a panel they just
opened. Expandable regions (MSS, module errors, flashlamp channels, Modbox,
Sequencer) are always rendered and shown/hidden client-side by a Datastar
signal.

One widget per *section* would repaint ~3 kB whenever any of forty PVs twitched;
one per *PV* would mean ~200 ids per laser. A cell is the unit an operator
reads, and also the unit that changes.

### Colour

Unchanged from the React app, because it is what keeps the HMI honest:

- templates own **geometry**; they emit `data-tone-surface` ("I am the element
  that paints") and `data-tone` ("this is the tone");
- `app/static/css/hmi.css`'s tone layer owns **colour**;
- `app/presentation/severity.py` is the only thing that decides *which* tone
  applies — transport loss > EPICS severity > widget emphasis.

So a template cannot invent its own red, and a widget's "this is good" emphasis
can never paint over an alarm.

## Writes

Every control posts to one endpoint, in one of two forms:

```html
data-on:click="@post('/api/write?pv=…&value=1')"           <!-- fixed value -->
data-on:click="@post('/api/write?pv=…&signal=NL2_delay')"  <!-- operator's value -->
```

`@post` sends every Datastar signal with the request, so the second form only
has to name which signal carries the value. The response is SSE events that
patch the status line — `usePvWrite`'s whole lifecycle, minus the hook.

A command PV (`CMD_<laser>_<NAME>`) is a trigger: the backend turns one press
into a coordinated chain of writes. The simulator implements short chains for
each command, which is the only reason the Sequencer row has anything to show.

## Two kinds of "disconnected"

The React app had one banner for a dead WebSocket. Here there are two failures
with two different operator responses, so there are two sentences:

- **`#link-banner`** — the *server* cannot reach EPICS. Channel Access has no
  session to query, so the hub judges it the way an operator would: the link is
  down when it is monitoring PVs and **not one of them** currently has a usable
  reading (a gateway restart or a pulled cable disconnects every channel at
  once; one dead IOC does not, and shows as `PV DSC` on its own rows). Pushed on
  the heartbeat; every readout greys out and keeps its last value.
- **the `$_age` watchdog** — the *browser* is no longer receiving the stream.
  `data-on-interval` counts seconds, every heartbeat resets it to 0, and the
  banner appears past 6. Without it a frozen page looks exactly like a quiet
  machine.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `ZONE_CODE` | `test` | Which `config/zones/<code>.yaml` to load |
| `EPICS_BACKEND` | `sim` | `sim` (built-in simulator) or `aioca` (real network) |
| `PORT` / `HOST` | `8082` / `0.0.0.0` | Same port the React app used |
| `RENDER_INTERVAL` | `0.15` | Seconds a burst of updates is collected before one render |
| `HEARTBEAT_SECONDS` | `2.0` | Stream heartbeat; must stay well under the watchdog's 6 s |
| `PREWARM` | `1` | Hold the page's monitors for the process lifetime so the first render has real values |
| `SIM_TICK_SECONDS` | `1.0` | Simulator update rate |
| `SIM_SEED` | `1` | Fixed seed keeps a demo reproducible; set empty for fresh noise |
| `DEV` | `0` | Reload templates and reparse the YAML on every request |
| `LOG_LEVEL` | `INFO` | |

Zones: `test` is the faithful copy of the React app's config (NL2 only).
`demo` clones it to NL1/NL2/NL3 so the grid wrapping is visible. `ioc` is
generated by `ioc/generate.py` and differs from `test` in exactly two PVs — the
ones that name a field of a synApps record type, which a base-only IOC cannot
serve (see [ioc/README.md](ioc/README.md)).

Against a real network, Channel Access also reads its own environment
(`EPICS_CA_ADDR_LIST`, `EPICS_CA_AUTO_ADDR_LIST`); nothing in this app
overrides it.

Operational endpoints: `/health/live`, `/health/ready` (503 until the hub is
up), `/stats` (monitor and stream counts — when a panel shows `<>`, the first
question is whether anything is monitoring that PV at all).

## Layout

```
app/
├── main.py                     app factory, lifespan, backend selection
├── settings.py                 environment -> Settings
├── templating.py               Jinja env; the one function that renders a widget
├── epics/
│   ├── types.py                PvId, PvSample, the EpicsBackend protocol
│   ├── hub.py                  monitors, cache, invalidation fan-out
│   ├── aioca_backend.py        real EPICS (lazy import)
│   └── sim_backend.py          in-process simulator
├── presentation/
│   ├── severity.py             tone/text/tooltip — the single decision table
│   ├── readouts.py             float/int/string/bool/aggregate readouts
│   ├── formatting.py           number format + units resolution
│   └── value_text.py           1/0 -> ON/OFF, YES/NO
├── modules/l4_opcpa/
│   ├── config.py               pydantic schema + zone loader
│   ├── pv_names.py             command vocabulary, CMD_<laser>_<NAME>
│   ├── widgets.py              the widget registry and its context builders
│   ├── view.py                 reverse index, page render, patch render
│   ├── routes.py               page, SSE stream, write endpoint
│   └── sim_seed.py             simulator seeding + command effect chains
├── templates/
│   ├── base.html               shell
│   └── l4_opcpa/
│       ├── page.html           signals, stream, legend, grid
│       ├── panel.html          one laser's static structure
│       ├── widgets.html        every patchable element (macros)
│       └── controls.html       write controls (never patched)
└── static/
    ├── css/hmi.css             tokens, geometry, the tone layer
    └── vendor/datastar.js      pinned v1.0.2, vendored — no CDN in a control room
ioc/
├── generate.py                 zone config -> EPICS database + the `ioc` zone
├── run_ioc.py                  runs it as a real IOC from a pip install
├── verify.py                   CA smoke test: connections, alarms, write, command
├── db/l4-opcpa.db              generated; committed so it can be read and diffed
├── st.cmd, Dockerfile          for a stock EPICS base installation
└── README.md
config/zones/{test,demo,ioc}.yaml
tests/
```

## Three ways to get PV data

| | What it is | When |
| --- | --- | --- |
| `EPICS_BACKEND=sim` | In-process simulator (`app/epics/sim_backend.py`) | Working on the UI. One command, no IOC. |
| `EPICS_BACKEND=aioca` + `ioc/` | A real EPICS IOC on localhost, database generated from the config | Testing the thing that will actually run: real records, real alarms, real CA. |
| `EPICS_BACKEND=aioca` | The control system | On site. |

The middle one exists because the first one can only be wrong in ways the
simulator itself invented. An `mbbi` read at its native type really does return
an index rather than a state name, and finding that out from a real IOC is worth
more than any amount of mock fidelity.

## Adding a module

The L4 page is one module under `app/modules/`. Another one needs: a config
schema + loader, a widget registry, a panel template, and routes — the same four
pieces, and `main.py` gains one `include_router`. `app/epics/` and
`app/presentation/` are module-agnostic and should stay that way.

## Known gaps in this draft

- **Not visually reviewed.** The CSS is a faithful port of the CSS Modules, but
  nobody has put the two pages side by side. Expect spacing to need a pass.
- **No authentication.** The React app used NextAuth + LDAP and both backends
  required a JWT on the WebSocket. Nothing here checks anything, so `/api/write`
  is open to whoever can reach the port.
- **Only `/l4-opcpa`.** The vacuum modules (`p3`, `l3bt`, `l4fbt`) and the
  zone/route enforcement from `src/proxy.ts` are not ported.
- **CSS Modules' scoping is gone** — class names are global and kebab-case.
- **The `l4-goggles` palette is defined but not selectable**; nothing sets
  `data-palette` yet.
- **No metadata tier for units/precision.** Subscriptions run at `FORMAT_TIME`,
  which carries severity, status and timestamp but not EGU or PREC, so units
  come from the config. `resolve_units`/`resolve_format` already have the slot.
- **A cog panel closes on press, not on success.** `usePvWrite` closed it when
  the write resolved; the result lands in the status line either way, and
  leaving the panel open over the value it just changed hides what the operator
  pressed the button to see.
- **`Escape` closes cog panels; there is no outside-click close.** `CogToggle`
  had both.
