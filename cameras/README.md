# cameras — live camera images in the HMI

A camera here is an EPICS **waveform PV holding a mono image**: `width × height`
16-bit pixels, row-major, typically 1024 × 1024 at 10 Hz. A screen shows one with
the `camera` component:

```yaml
- component: camera
  label: NL1 near field
  pv: L4-OPCPA-NL1:CAM1:Image   # waveform, USHORT (or SHORT), width*height elements
  width: 1024
  height: 1024
  bits: 12                      # a 12-bit sensor saturates at 4095
  rate: 10                      # frames per second the camera delivers
  levels: auto                  # or [black, white]
  filters: true                 # IOC on EPICS base >= 7.0.3 — see "Load" below
```

Click a tile for the **focus view**: full resolution at the camera's full rate,
and a **16-bit** switch that sends every pixel exactly. The page then applies its
own levels and colour map, and shows the true value under the cursor.

This folder is the **camera gateway**. It receives frames, encodes them and serves
them to browsers. It runs inside the HMI (`CAMERA_GATEWAY=embedded`, the default)
or as its own process (`python -m cameras`).

## Why images get their own path

A frame is 2 MiB, ten times a second. The HMI's value path is built for
scalars: the PV hub caches every value and compares old with new, the aioca
backend turns arrays into Python lists, PREWARM keeps every monitor open for
ever, and a screen update is an HTML fragment. Any one of those would sink a
camera. So images go through their own pipeline beside the PV hub, never
through it, and reach the browser on a binary WebSocket rather than over
Datastar's SSE.

```
IOC waveform ──CA──▶ FrameSource ──Frame──▶ CameraHub ──────────────▶ Viewer ──WebSocket──▶ cameras.js
                     (aioca | sim)          one subscription per camera         one per page       canvas per tile
                     opened on demand       one encode per (camera, scale)      latest-wins slots
                                            on a thread pool
```

| File | What |
| --- | --- |
| `spec.py` | `CameraSpec`, what a camera is (from the component's YAML), and `Frame` |
| `source.py` | The `FrameSource` interface the hub talks to |
| `ca.py` | Frames over Channel Access, through aioca |
| `sim.py` | The built-in simulator: a laser beam, not noise |
| `channels.py` | Which CA name to monitor: the PV, or the PV with a `dec` filter |
| `encode.py` | Downscale, levels, JPEG, statistics, lossless — pure numpy/Pillow |
| `hub.py` | `CameraHub`: on-demand subscriptions, shared encodes, latest-wins delivery |
| `protocol.py` | The wire format (below) |
| `routes.py` | The WebSocket and the statistics endpoint |
| `server.py` | The standalone process |

## Load: what a hundred cameras cost

Per 1024 × 1024 16-bit camera at 10 Hz, on the network between IOC and gateway:

| | per camera | 100 cameras |
| --- | --- | --- |
| full stream | 20 MiB/s (168 Mbit/s) | 2 GiB/s (≈ 17 Gbit/s) |
| IOC-decimated for a 2 fps tile, `PV.{"dec":{"n":5}}` | 4 MiB/s | 400 MiB/s |
| nobody looking at it | **0** | **0** |

The binding constraint is the wire, not the language: a 1 GbE link carries about
five full-rate cameras whatever the gateway is written in, and the per-pixel work
runs in C anyway (numpy, libjpeg-turbo). So the gateway is built around not
moving bytes:

1. **A camera nobody looks at costs nothing.** The page only asks for tiles that
   are on screen (IntersectionObserver). A hidden tab asks for nothing. The hub
   opens the CA monitor when a camera's first viewer arrives and closes it when
   the last one leaves.
2. **Reduce at the source.** With `filters: true` the gateway monitors
   `PV.{"dec":{"n":k}}`, so the IOC sends only every k-th frame, just enough for
   the fastest viewer. A focus view at full rate switches the channel back to
   the plain PV, and the tiles keep their frames through the switch. Only IOCs on
   EPICS base 7.0.3 or later understand the filter. Leave it off for older ones,
   and the gateway thins the stream itself instead.
3. **Receive once, encode once per scale, fan out.** Tiles ask for a width. The
   gateway picks a downscale factor from a fixed ladder (1, 2, 4, 8), so ten
   browsers with slightly different tile widths still share one encode.
4. **Latest wins, nothing queues.** Each viewer has one slot per camera. A
   frame that arrives before the previous one was sent replaces it and counts as
   a drop. Hypercorn awaits the socket draining, so a slow browser blocks only
   its own sender and sees fewer frames, never older ones, and the gateway's
   memory does not grow with it. aioca does the same at the CA layer.

### Measured

`make camload` writes a zone of N simulated cameras, starts the gateway as its
own process, opens C WebSocket clients and runs three scenarios. In each, every
client shows all cameras as 2 fps tiles (*wall*). *focus* adds one full-res
10 fps focus view per client. *lossless* switches those focus views to 16-bit.
`make cambench` times each per-frame step on one core.

Run on an Apple M5 Pro (18 cores), 100 cameras 1024 × 1024 12-bit at 10 Hz,
built-in simulator, 4 clients:

| scenario | delivered / asked | p50 / p95 latency | into gateway | to browsers | dropped | gateway CPU |
| --- | --- | --- | --- | --- | --- | --- |
| wall | 800 / 800 fps (100 %) | 16 / 40 ms | 2000 MiB/s ¹ | 3.3 MiB/s | 0 | 1.0 core |
| focus | 832 / 832 (100 %) | 27 / 46 ms | 2016 MiB/s ¹ | 3.9 MiB/s | 0 | 1.1 cores |
| lossless | 832 / 832 (100 %) | 34 / 48 ms | 2017 MiB/s ¹ | 27 MiB/s | 2 | 1.6 cores |

¹ The simulator makes every camera's full stream in-process, so this CPU
includes generating 1000 frames a second. On a station those bytes would arrive
over CA instead. They cannot (2 GiB/s), which is why `filters: true` matters.

With 16 clients the wall still delivers 100 % of 3200 fps, at **1.1 cores**,
about the same as with 4: viewers share encodes. Sixteen lossless focus views
reach 64 MiB/s to the browsers, p95 219 ms, and drop 130 frames rather than
queue them.

Over real Channel Access (`make camload` with `--ca`, against `ioc/run_ioc.py`),
20 cameras, 2 clients, tile wall:

| | into gateway | gateway CPU |
| --- | --- | --- |
| `filters: false` | 400 MiB/s | 0.50 core |
| `filters: true` | 82 MiB/s | 0.30 core |

And 100 cameras with `filters: true`, 4 clients: 99–100 % delivered, 406 MiB/s
in, 0.75–1.4 cores. Both CA runs were on linux/amd64 emulated on the same Mac,
so their CPU figures are pessimistic.

Per frame on one core (`make cambench`, 1024², 12-bit): a 512² tile 0.8 ms, a
256² tile 0.5 ms, a full-resolution JPEG 2 ms, a full-resolution lossless frame
7–11 ms (0.6–0.8 MB, because sensor noise does not compress). Statistics take
0.02 ms, and simulating a frame takes 0.1–0.8 ms.

### Decision: Python is enough; what would change that

One Python gateway process serves a hundred cameras' tiles plus focus views on
about one core, with headroom left on a station-class machine. A gateway in
another language would save part of that core but not a byte on the network,
and the network is the limit. So the gateway stays Python, in the same image as
the HMI.

If a station ever outgrows one process, the protocol below is language-neutral.
Shard cameras across several gateway processes, or replace the gateway with one
in Rust (epics-ca-rs, or bindings to libca, plus libjpeg-turbo). Nothing on the
page changes either way.

## Running it

| Setting | Default | Meaning |
| --- | --- | --- |
| `CAMERA_GATEWAY` | `embedded` | `embedded`: the HMI serves frames itself. `http://station:8083`: a standalone gateway does, and pages connect there. `off`: no frames |
| `CAMERA_PORT` | `8083` | Where `python -m cameras` listens |
| `SESSION_SECRET` | — | **Must be the same** for HMI and gateway: the gateway checks the HMI's cookie |
| `EPICS_BACKEND` | `sim` | `sim` draws frames; `aioca` monitors the waveform PVs |
| `EPICS_CA_AUTO_ARRAY_BYTES` | `YES` | Base ≥ 3.16.1 sizes CA buffers itself. If a station sets `NO`, `EPICS_CA_MAX_ARRAY_BYTES` must hold a whole frame, or the gateway refuses to start (it would otherwise connect and never show an image) |

On an IOC older than EPICS base 3.16.1, its own `EPICS_CA_MAX_ARRAY_BYTES` must
hold a whole frame. That is the IOC's configuration, and the gateway cannot check
it from here.

```
make run                     # embedded, simulator — open /cameras
make run-cameras             # standalone gateway on 8083 (simulator)
make run-with-gateway        # …and the HMI that sends its pages there
make ioc && make run-ioc     # real CA: the local IOC serves the zone's cameras
make cambench / make camload # what it costs
```

`docker compose up --build` runs the HMI and the gateway as two services from one
image.

**Security.** The socket requires the same signed session cookie as every
screen. That check is a `before_websocket` hook (`core/login.py`), because
Quart's `before_request` gate never sees a WebSocket. The browser's `Origin`
must name this host (any port), so a page elsewhere cannot open the socket with
an operator's cookie. A page names cameras, never PVs: the gateway serves only
the zone's cameras.

**Diagnostics.** `/monitor` has a Cameras panel: every camera, open or idle,
with its channel, viewers, frames in per second, encode time, bytes out and drops.
For a standalone gateway, the HMI fetches the stats with a cookie it signs itself
using the shared secret.

## The simulator: a beam, not šum

`EPICS_BACKEND=sim` draws a laser beam rather than random static. Noise would
teach nothing about how a screen looks with a real beam, and it would make every
load figure wrong: noise is the worst case for compression, and a real beam frame
is mostly a quiet dark background.

- **Character** comes from the PV name, so a camera looks the same on every run
  and no two cameras on a wall look alike. That covers where the beam sits, its
  size, its slight ellipticity and tilt, and its hot pixels. Set `sim.profile`
  (`gaussian` or `flattop`), `waist`, `peak`, `jitter`, `pointing` and `spikes`
  per camera.
- **Behaviour** comes from `SIM_SEED`:
  - pointing jitter that reverts to the mean (Ornstein–Uhlenbeck) plus a slow drift;
  - shot-to-shot energy jitter;
  - occasional spikes that saturate the sensor, if configured.
- **Sensor:** a dark offset, read noise of a few counts, shot noise in the
  beam, and clipping at 2^bits − 1.
- **Cost:** the beam is a template computed once and placed each frame, and the
  background is a window into a shared precomputed noise bank. That's 0.1–0.8 ms
  a frame, and only for cameras someone is watching.

`ioc/run_ioc.py --zone` publishes the same simulated frames as real waveform
records, so the CA path can be tested end to end.

## Wire protocol

One WebSocket per page at `/api/cameras/ws`, carrying every camera on the page.
`protocol.py` is the reference implementation, and `tests/test_camera_protocol.py`
pins the page's parser to it.

**Server → client, text, once:**

```json
{"hello": {"cameras": ["PV1", "PV2"], "scales": [1, 2, 4, 8],
           "status": {"0": {"text": "", "tone": null},
                      "1": {"text": "SATURATED", "tone": "warning"}, "…": "…"},
           "stale": {"text": "NO FRAMES", "tone": "unknown"}}}
```

A frame names its camera by index into `cameras`. `status` says how each status
looks; the page applies it and never decides a tone itself.

**Client → server, text, any time:**

```json
{"view": {"PV1": {"px": 704, "fps": 2}, "PV2": {"px": 1600, "fps": 10, "lossless": true}}}
```

This is the complete set of cameras the page shows right now, and each message
replaces the previous one, so a reconnect is just "send the view again". `px` is
the drawn width in device pixels. A camera not in the zone comes back in
`{"rejected": [...]}`.

**Server → client, binary:** a 28-byte little-endian header, then the image.

| offset | type | field |
| --- | --- | --- |
| 0 | u8 | version (1) |
| 1 | u8 | encoding: 1 = 8-bit grey JPEG (levels applied); 2 = 16-bit lossless |
| 2 | u16 | camera index |
| 4 | u32 | sequence number (gaps are frames this viewer skipped) |
| 8 | f64 | frame timestamp, Unix seconds (the EPICS timestamp) |
| 16 | u16 | width |
| 18 | u16 | height (0 × 0: no image, only a status) |
| 20 | u8 | downscale factor |
| 21 | u8 | status: 0 OK, 1 saturated, 2 bad frame, 3 disconnected |
| 22 | u16 | brightest raw pixel in the full-resolution frame |
| 24 | u16 | saturated pixels, per mille, rounded up |
| 26 | u16 | reserved |

**Encoding 2, lossless:** the little-endian 16-bit words, byte-shuffled (all low
bytes, then all high bytes), then zlib-compressed. A browser inflates it with
`DecompressionStream('deflate')`. `encode.decode_lossless` is the reference
reader.
