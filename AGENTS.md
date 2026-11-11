# AGENTS.md

Guidance for coding agents (Claude Code etc.) working in this repository.

The repository is one app: the ELI Beamlines operator HMI as a single Python process (Quart + Hypercorn + Jinja server-side rendering + Datastar over SSE + `aioca`, with uv managing dependencies). It is both the operator interface and the EPICS gateway. [README.md](README.md) is the canonical description; `zones/`, `components/` and `ioc/` each have a README for their own audience. The Next.js frontend, the FastAPI gateway, the Go mock server and the `docs/` ADR tree that used to live here are retired. They survive only in git history, so don't recreate or link to them.

## Workflow

- When entering plan mode or producing any implementation plan, invoke the `tdd` skill and structure the plan around it: failing test first, minimal code to pass, refactor.

## Repo layout

The structure is the config:

- `zones/<CODE>/zone.yaml` declares a zone and the hostname globs that select it. `zones/<CODE>/<screen>/gui.yaml` is a screen. A folder is a screen: its route and menu entry come from the folder listing, so there is no registry or menu to edit.
- `components/` holds the reusable pieces (`value`, `group`, `grid`, `tally`, `motor`, `valve`, `panel`, `camera`, `laser_panel`), each a folder with Python and a Jinja template, used from YAML. A component declares a pydantic `Config`, a `setup()` for its live widgets, and `pv_specs()` saying what each PV is. `components/valve/` is the smallest one to copy.
- `cameras/` is the camera gateway: live images from waveform PVs. It is a path of its own beside the PV hub, never through it. `cameras/README.md` covers the design, the measured load and the wire protocol. It runs inside the HMI (`CAMERA_GATEWAY=embedded`) or as its own process (`python -m cameras`, port **8083**).
- `core/` holds zone resolution, the EPICS hub, rendering and routes. `core/__init__.py` has the module map. It also holds `/monitor`, the diagnostics dashboard (`core/monitor.py`), which is the one page that isn't a zone folder. Its name and the app's other fixed paths are reserved slugs (`RESERVED_SLUGS` in `core/zones.py`).
- `ioc/` is a local EPICS IOC whose database is **generated** from what the components declare (`uv run python ioc/generate.py --zone TESTZ`). Never edit `ioc/db/*.db`: add a screen and regenerate. `generate.py` also writes `zones/<ZONE>-IOC/`, which is identical to the real zone except for PVs naming a *field* of a synApps record (no base-only IOC can serve a name with a dot in it) and answers to no hostname, so a station can never resolve to it. It runs via pythonSoftIOC from the `ioc` extra (no EPICS build), or as a stock `softIoc` in Docker (`ioc/Dockerfile`).
- `tests/` is pytest. The end-to-end tests drive a real Hypercorn socket, because the thing under test is a streaming response. The camera socket tests use the `websockets` client from the dev group.
- `tools/snapshot.py` freezes one render of every screen as static HTML for layout review. `tools/cambench.py` and `tools/camload.py` measure what camera frames cost.

Dependencies are one `pyproject.toml` plus a committed `uv.lock`, with no requirements.txt. The heavy optional pieces are extras: `--extra epics` for aioca, `--extra ioc` for pythonSoftIOC. Every Makefile target runs through `uv run`, so there is no venv to activate.

## Commands

All from the repo root:

- `make run` starts `ZONE_CODE=TESTZ` with the built-in simulator (`EPICS_BACKEND=sim`) and `DEV=1`, on **port 8082**. It needs no IOC and no Node. Sign in as `test` / `test`.
- `make run-zone ZONE_CODE=01` does the same for another zone.
- `make test` runs the suite. Run it after every change.
- `make components` lists the component registry with one line each.
- `make snapshot` writes static renders to `snapshot/`.
- Cameras: `make run` serves them embedded (the TESTZ `cameras` screen). `make run-cameras` runs the standalone gateway on 8083, and `make run-with-gateway` runs the HMI that points pages at it. `make cambench` and `make camload CAMERAS=100 CLIENTS=4` measure.
- Local IOC: `make ioc-db` regenerates the db and the `-IOC` zone. `make ioc` runs a real EPICS IOC on CA 5064. `make run-ioc` (in another shell) runs the HMI against it. `make ioc-verify` is the CA smoke test.
- `make run-epics` runs against the real control system. It needs `SESSION_SECRET` and `LDAP_SERVER_URL`.
- `make lock` / `make upgrade` rewrite `uv.lock`. Commit the diff.
- `docker compose up --build` is the same quick start in a container.

## Architecture: things that span multiple files

- **Zone resolution** (`core/zones.py`): `ZONE_CODE`, or else the hostname matched against each `zone.yaml`'s `hostnames:` globs. A station that matches nothing refuses to start. One image serves every zone.
- **How a value reaches the screen:** `core/epics/hub.py` holds one ref-counted monitor per (PV, datatype) and hands out invalidations. `core/page.py` maps PV → widgets and renders the whole screen or just the touched widgets. `core/routes.py` runs the SSE loop (`/<screen>/stream`), which collects a burst for `RENDER_INTERVAL` and pushes one `datastar-patch-elements` event. One renderer serves first paint and patches, so they are byte-identical.
- **Widget granularity:** a widget is a value cell, pill or list, never a row. Labels, inputs and cog buttons are rendered once and never patched.
- **Colour:** components own geometry and emit `data-tone-surface` / `data-tone`. `core/static/css/hmi.css` owns colour. `core/render/severity.py` is the only thing that decides which tone applies (transport loss > EPICS severity > component emphasis), so never hard-code a colour in a component.
- **Writes:** every control posts to `POST /api/write` (`?pv=…&value=…` or `?pv=…&signal=…`). Command PVs and their effects are declared once in `pv_specs()` and drive both the simulator and the generated IOC.
- **Exclusive write control:** `exclusive:` on a control in screen YAML lets one browser tab at a time write that PV.
  - A component declares the PV with `Component.exclusive()`. `Zone.exclusive_pvs()` unions them, and one `core/locks.py` `LockTable` on `app.hmi.locks` holds the state.
  - The lock is keyed by PV, so a PV marked exclusive on one screen is exclusive on all of them.
  - `/api/write` refuses the PV unless the request's `tab` signal and user match the holder. `POST /api/lock` takes, releases or forces it.
  - The page mints `tab` and the browser keeps it in `sessionStorage`. It is the one page signal without a `_` prefix, because Datastar doesn't send `_` signals.
  - Each screen stream opens a `LockTable.watch()` that keeps its tab's locks alive and wakes the loop to push `_locks`, plus a toast when someone forced the lock away.
  - A lock lapses `LOCK_GRACE_SECONDS` after its tab stops showing the PV.
  - The controls in `controls.html` follow `$_locks.<key>.state`. They are never patched.
- **Camera frames** (`cameras/`) never touch the PV hub, widgets or SSE.
  - A component declares `cameras()` (a `CameraSpec` each) beside `pv_specs()`. `Zone.cameras()` unions them by PV and refuses conflicting geometry.
  - `CameraHub` opens a source (aioca or the beam simulator) when a camera's first viewer arrives and closes it when the last one leaves. It encodes once per (camera, scale) on a thread pool, and delivers to per-viewer latest-wins slots.
  - With `filters: true` it monitors `PV.{"dec":{"n":k}}` so the IOC decimates (`cameras/channels.py`).
  - Pages get `core/static/js/cameras.js`, the only script besides Datastar, and only on screens with a camera. It opens one WebSocket (`/api/cameras/ws`), sends the full `view` of what is on screen, and draws onto canvases.
  - The socket is gated by `install_socket_gate` in `core/login.py`: the session cookie plus a same-host `Origin`. Quart's `before_request` gate does not see WebSockets.
  - Status tones come from `camera_tone()` in `core/render/severity.py`, sent in the hello message.
  - A standalone gateway shares `SESSION_SECRET` with the HMI, which is how it accepts the HMI's cookie.
- **Diagnostics (`/monitor`):** this page reads state and keeps none of its own.
  - `PvHub.monitors()` gives the refcount, latest sample and update count for each monitor.
  - `core/clients.py`'s `ClientRegistry` lists the open SSE streams. `_stream_events` opens and closes an entry.
  - `core/logbook.py`'s `LogBook` is a second root handler, attached in `before_serving` and detached in `after_serving`. With `LOG_DIR` set it also writes rotating JSON lines and reads them back on start.
  - `core/monitor.py`'s `collect()` builds the view model, and `monitor_panels.html` renders it for the first paint and for patches.
  - Its stream ticks on the heartbeat rather than on PV changes, and it must end on `shutting_down` like a screen's stream.
- **Auth:** `core/auth.py` does an LDAP simple bind as `<user>@LDAP_UPN_DOMAIN` and issues an HMAC-signed session cookie. It adds a `test`/`test` account when `DEV=1`. `core/login.py` has the login form and the `before_request` gate on every route; `PUBLIC_PATHS` there is the whole exception list. `SESSION_SECRET` is required unless `DEV=1`. Auth events and every write are logged with the actor; the password and the cookie never are.

## Conventions worth knowing

- The port is **8082**, not 8000 or 3000. Operators have it bookmarked. The standalone camera gateway is **8083**.
- Screens are YAML. YAML traps (`OFF` is a boolean) are covered in `zones/README.md`.
- Templates are Jinja, under `core/templates/` and `components/**`. Static assets live in `core/static/`. Link them with `static()`, which adds a content hash to `.css` and `.js` URLs (`?v=…`). They're served with a 12-hour cache, so a hard-coded `/static/…` URL keeps serving the old file after a change. `datastar.js` is vendored and must match the `datastar-py` pin in `pyproject.toml`.
- Commit subjects are short imperative. Prefix with the Jira/issue id when there is one (e.g. `OPHMI-15: ...`).

## CI

Branch model: `main` is production, `dev` is integration (the default branch, and where PRs go), and every other branch is work in progress.

`.gitlab-ci.yml`:
- `python-hmi-test` runs `make test` on `python:3.12`. uv and packages come from the internal PyPI mirror (`UV_DEFAULT_INDEX`), because the runner has no public route. That changes the resolution, so the job is not `--locked`.
- `docker-build-job-python-hmi` builds the repo root and pushes `eli-hmi-ssr` to Harbor. That one image is both the operator interface and the EPICS gateway. Its Dockerfile pulls the base image through Harbor's proxy and resolves packages through the same mirror.
  - Every branch pushes `:<branch-slug>`, its newest build, and `:<branch-slug>-<short-sha>`, that exact build.
  - Only `main` pushes `:latest`, so `latest` is always production. The check names `main` literally, because `$CI_DEFAULT_BRANCH` is `dev`.
