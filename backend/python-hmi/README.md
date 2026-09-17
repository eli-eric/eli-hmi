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

Open <http://localhost:8082> and sign in as **test / test** (`make run` sets
`DEV=1`, which is what turns that account on — see [Signing in](#signing-in)).
Three screens in the menu: **L4 OPCPA** (the bespoke laser panel), **Chillers**
and **Vacuum** (both pure YAML, no Python written for them). Values move, alarms
appear, buttons write.

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
export SESSION_SECRET=$(python -c 'import secrets; print(secrets.token_urlsafe(32))')
export LDAP_SERVER_URL=ldap://10.78.0.11
python -m core            # zone from the hostname; see zones/README.md
```

Tests: `make test` (293 tests, ~8 s — the end-to-end ones run a real uvicorn
socket, because the thing under test is a streaming response).

To *look* at a screen without a running IOC — for a layout review, a diff
against the React page, or to send someone a page to comment on:

```bash
python tools/snapshot.py --zone TESTZ --out /tmp/snapshot   # frozen HTML, opens anywhere
```

## Signing in

Every screen, the live stream and every write are behind a session. There are
two ways to get one:

- **LDAP** — a simple bind as `<username>@$LDAP_UPN_DOMAIN` against
  `$LDAP_SERVER_URL`. The same thing the React app does
  (`frontend/src/lib/server/auth/ldap-auth.ts`), so the credentials an operator
  uses on a station today work here unchanged, and this app needs no service
  account of its own.
- **the built-in `test` / `test` account** — only when `DEV=1`, and the startup
  banner says so in as many words every time the process comes up.

The session is a cookie signed with `SESSION_SECRET` (HMAC-SHA256) that carries
its own expiry, so there is no session table: restarting a station mid-shift
does not sign anyone out, and there is nothing to share between zones. It is
`HttpOnly`, `SameSite=Lax`, and `Secure` as soon as you set
`SESSION_COOKIE_SECURE=1` — do that the moment there is TLS in front.

`SESSION_SECRET` is **required** outside `DEV=1`: a generated key works
perfectly until the process restarts, which is the worst possible moment to find
out. Generate one with `python -c 'import secrets; print(secrets.token_urlsafe(32))'`.

What the console says, and it is the audit trail:

```
INFO    core.auth: authentication: LDAP ldap://10.78.0.11; sessions 12h, cookie secure=no
WARNING core.auth: login failed user=jsvacha via=ldap ip=10.78.4.21 reason=invalid credentials (41ms)
INFO    core.auth: login ok user=jsvacha via=ldap ip=10.78.4.21 (38ms)
INFO    core.auth: session issued user=jsvacha via=ldap valid=12h -> /l4-opcpa
INFO    core.routes: SSE stream opened for /l4-opcpa by user=jsvacha (48 PVs, 48 monitors, 1 streams)
INFO    core.routes: write ok user=jsvacha pv=L4-OPCPA-NL2:IO:15:RC1_pin31 value=1
WARNING core.auth: no session: POST /api/write refused (401)
INFO    core.auth: logout user=jsvacha ip=10.78.4.21 (session had 11.7h left)
```

Every sign-in attempt leaves exactly one line, and a failed one is a WARNING —
a handful is someone mistyping, a screenful is worth looking at. "Wrong
password" and "the directory did not answer" are different lines in the console
and deliberately the *same* sentence in the browser: the form is reachable by
anyone who can reach the port. The password and the cookie are never logged at
any level, and `core.auth`'s refusal helper does not even take the password as
an argument, so it cannot end up in a line by accident.

Where the gate is: `core/login.py`, as HTTP middleware rather than a dependency
on each route. Routes here are generated from the zone's folders, and "the
screen someone forgot to protect" has to be impossible rather than unlikely.
`PUBLIC_PATHS` in that file is the complete list of what is reachable without
signing in: the login form, the health endpoints (a container probe has no
credentials) and `/static/`.

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
| `SESSION_SECRET` | — | Signs the session cookie. **Required** unless `DEV=1` |
| `SESSION_HOURS` | `12` | How long a sign-in lasts — one shift |
| `SESSION_COOKIE_SECURE` | `0` | `Secure` on the cookie. Set it when there is TLS in front |
| `LDAP_SERVER_URL` | — | e.g. `ldap://10.78.0.11`. Unset means LDAP sign-in is off |
| `LDAP_UPN_DOMAIN` | `lcs.local` | `<user>@<this>` is what gets bound |
| `LDAP_USE_TLS` | `0` | LDAPS (port 636). Certificates are not verified yet — see the gaps |
| `LDAP_TIMEOUT_SECONDS` | `5` | How long a sign-in waits for the directory |
| `EPICS_BACKEND` | `sim` | `sim` (built-in simulator) or `aioca` (real network) |
| `PORT` / `HOST` | `8082` / `0.0.0.0` | Same port the React app used |
| `RENDER_INTERVAL` | `0.15` | Seconds a burst of updates is collected before one render |
| `HEARTBEAT_SECONDS` | `2.0` | Stream heartbeat; must stay well under the watchdog's 6 s |
| `PREWARM` | `1` | Hold the screens' monitors for the process lifetime, so the first render has real values |
| `PALETTE` | — | `l4-goggles` repaints every negative indication in a colour that survives the L4 hall's safety goggles |
| `SIM_TICK_SECONDS` | `1.0` | Simulator update rate |
| `SIM_SEED` | `1` | Fixed seed keeps a demo reproducible; set empty for fresh noise |
| `ZONES_ROOT` | `zones/` | Where the zone folders live |
| `DEV` | `0` | Reload templates on every render, **and accept `test`/`test`** |
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
| NextAuth + `ldap-authentication` + an HS256 JWT on the wire | `core/auth.py`: one LDAP bind, one signed cookie |
| `proxy.ts` redirecting unauthenticated page routes | `core/login.py`'s middleware, covering pages, streams and writes |
| `MODULES` registry + `src/proxy.ts` route enforcement | the zone's folder listing |
| Go mock server (`l4_opcpa.go`) | `core/epics/sim_backend.py`, seeded from `pv_specs()` |
| `backend/epics` hand-written IOC database | `ioc/` — generated from `pv_specs()` |
| `POST /pv/<NAME>` | `POST /api/write` |

## Known gaps in this draft

- **Not reviewed against the React page side by side.** The layout itself has
  been reviewed (`tools/snapshot.py` renders it), and no reading truncates at
  1280–2560px — but nobody has put the two apps next to each other.
- **No webfont is shipped.** The stylesheet asks for Roboto Condensed and falls
  back to Arial Narrow, and the fixed 8.5rem label column was measured with
  Roboto Condensed: on a machine without it, the longest device labels
  ("Regen SY3PL50M:32") truncate by a few pixels. They carry the full text as a
  tooltip, but vendoring the font beside `datastar.js` is the fix.
- **No group or role check.** Authorisation is the zone, as ADR-0002 has it:
  anyone the directory knows can sign in to a station and write to it. A
  `LDAP_REQUIRE_GROUP` would need a bind-and-search instead of a simple bind.
- **LDAPS does not verify the certificate** (`LDAP_USE_TLS=1` encrypts but
  trusts anything), matching the React app's `rejectUnauthorized: false`. Fine
  on a closed zone network, not fine over anything wider.
- **Nothing rate-limits sign-in attempts.** The console shows a wave of them;
  nothing slows one down.
- **A session cannot be revoked.** A stateless cookie is valid until it expires
  (`SESSION_HOURS`); signing out clears the browser's copy. Rotating
  `SESSION_SECRET` and restarting invalidates every session at once, which is
  the only lever.
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
