// Camera tiles: one WebSocket per page, frames drawn onto each tile's canvas.
//
// Loaded only on screens with a camera (core/templates/base.html). Everything
// else on the page is Datastar; this is the one thing it cannot do, because a
// frame is binary and arrives ten times a second.
//
// The page tells the gateway what it is showing — which cameras are on screen,
// how wide each is drawn, how many frames a second it wants — and nothing
// else. A tile scrolled out of view, or a hidden tab, drops out of that view,
// and the gateway stops sending (and, with no other viewer, stops receiving)
// that camera. The protocol is described in cameras/README.md; the header
// layout must match cameras/protocol.py (tests/test_camera_protocol.py pins it).

const HEADER_SIZE = 28;
const ENCODING_JPEG = 1;
const ENCODING_LOSSLESS16 = 2;
//: Frames a second a tile asks for, at most. The focus view asks for the
//: camera's full rate.
const TILE_FPS = 5;
//: How long without a frame before a tile says so, at the least.
const STALE_SECONDS = 3;
const RECONNECT_MAX_SECONDS = 15;
const FALLBACK_STALE = { text: 'NO FRAMES', tone: 'unknown' };

const meta = document.querySelector('meta[name="hmi-camera-socket"]');

function parseHeader(buffer) {
  const view = new DataView(buffer);
  return {
    version: view.getUint8(0),
    encoding: view.getUint8(1),
    camera: view.getUint16(2, true),
    seq: view.getUint32(4, true),
    timestamp: view.getFloat64(8, true),
    width: view.getUint16(16, true),
    height: view.getUint16(18, true),
    factor: view.getUint8(20),
    status: view.getUint8(21),
    maxValue: view.getUint16(22, true),
    saturated: view.getUint16(24, true),
  };
}

// The browser inflates zlib natively; no library.
async function inflate(payload) {
  const stream = new Blob([payload]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Colour maps for 16-bit frames, as RGB at t in 0..1. This is the image's own
// data, not a status colour: status tones stay in hmi.css.
const PALETTES = {
  grey: (t) => [t * 255, t * 255, t * 255],
  heat: (t) => [Math.min(1, t * 3) * 255, Math.min(1, Math.max(0, t * 3 - 1)) * 255, Math.max(0, t * 3 - 2) * 255],
};

// value -> packed RGBA, for every possible 16-bit value: one table lookup per
// pixel, which is what keeps a 1-megapixel frame at a few milliseconds.
function buildLut(black, white, palette) {
  const lut = new Uint32Array(65536);
  const span = Math.max(1, white - black);
  const colour = PALETTES[palette] || PALETTES.grey;
  for (let v = 0; v < 65536; v++) {
    const t = Math.min(1, Math.max(0, (v - black) / span));
    const [r, g, b] = colour(t);
    lut[v] = (255 << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
  }
  return lut;
}

// Draws frames onto one canvas. Latest wins: a frame that arrives while the
// previous one is still decoding replaces any frame already waiting, never
// queues behind it.
class Renderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.levels = options.levels || null; // (values, header) -> [black, white]
    this.palette = options.palette || (() => 'grey');
    this.busy = false;
    this.pending = null;
    this.values = null; // the last 16-bit frame, for the pixel readout
    this.lutKey = '';
    this.lut = null;
  }

  draw(header, payload) {
    if (this.busy) {
      this.pending = [header, payload];
      return;
    }
    this.busy = true;
    const work =
      header.encoding === ENCODING_LOSSLESS16 ? this.drawExact(header, payload) : this.drawJpeg(payload);
    work
      .catch(() => {})
      .finally(() => {
        this.busy = false;
        const next = this.pending;
        this.pending = null;
        if (next) this.draw(...next);
      });
  }

  fit(width, height) {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  async drawJpeg(payload) {
    this.values = null;
    const bitmap = await createImageBitmap(new Blob([payload], { type: 'image/jpeg' }));
    this.fit(bitmap.width, bitmap.height);
    this.context.drawImage(bitmap, 0, 0);
    bitmap.close();
  }

  async drawExact(header, payload) {
    const { width, height } = header;
    const planes = await inflate(payload);
    const n = width * height;
    const values = new Uint16Array(n);
    for (let i = 0; i < n; i++) values[i] = planes[i] | (planes[n + i] << 8);
    this.values = { values, width, height };
    const [black, white] = this.levels ? this.levels(values, header) : [0, 65535];
    const key = `${black}:${white}:${this.palette()}`;
    if (key !== this.lutKey) {
      this.lut = buildLut(black, white, this.palette());
      this.lutKey = key;
    }
    this.fit(width, height);
    const image = this.context.createImageData(width, height);
    const out = new Uint32Array(image.data.buffer);
    const lut = this.lut;
    for (let i = 0; i < n; i++) out[i] = lut[values[i]];
    this.context.putImageData(image, 0, 0);
  }
}

function showStatus(chip, look) {
  chip.textContent = look.text;
  chip.hidden = !look.text;
  if (look.tone) chip.dataset.tone = look.tone;
  else delete chip.dataset.tone;
}

class Tile {
  constructor(element) {
    this.element = element;
    this.pv = element.dataset.camera;
    this.rate = Number(element.dataset.cameraRate) || 10;
    //: Full scale: 2^bits - 1.
    this.max = Number(element.dataset.cameraMax) || 65535;
    this.canvas = element.querySelector('canvas');
    this.chip = element.querySelector('[data-camera-status]');
    this.renderer = new Renderer(this.canvas);
    this.visible = false;
    //: The focus view shows this camera; the tile underneath stops drawing.
    this.paused = false;
    this.lastFrameAt = 0;
  }

  want() {
    if (!this.visible || document.hidden) return null;
    const px = Math.max(1, Math.round(this.canvas.clientWidth * (window.devicePixelRatio || 1)));
    return { px, fps: Math.min(this.rate, TILE_FPS) };
  }

  receive(header, payload, look) {
    this.lastFrameAt = performance.now();
    showStatus(this.chip, look);
    if (!this.paused && header.width && header.height) this.renderer.draw(header, payload);
  }
}

// The focus view: one dialog per screen, showing whichever tile was clicked.
class Focus {
  constructor(dialog, onChange) {
    this.dialog = dialog;
    this.onChange = onChange;
    this.tile = null;
    this.lastFrameAt = 0;
    const q = (name) => dialog.querySelector(`[data-focus-${name}]`);
    this.canvas = q('canvas');
    this.chip = dialog.querySelector('[data-camera-status]');
    this.title = q('title');
    this.pvLabel = q('pv');
    this.lossless = q('lossless');
    this.levelMode = q('levels');
    this.black = q('black');
    this.white = q('white');
    this.paletteSelect = q('palette');
    this.readout = q('readout');
    this.info = q('info');
    this.renderer = new Renderer(this.canvas, {
      levels: (values, header) => this.levels(values, header),
      palette: () => this.paletteSelect.value,
    });
    q('close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => this.closed());
    this.lossless.addEventListener('change', () => this.onChange());
    this.canvas.addEventListener('mousemove', (event) => this.point(event));
    this.canvas.addEventListener('mouseleave', () => (this.readout.textContent = ''));
  }

  get pv() {
    return this.tile ? this.tile.pv : null;
  }

  open(tile) {
    if (this.tile) this.tile.paused = false;
    this.tile = tile;
    tile.paused = true;
    this.title.textContent = tile.element.querySelector('.panel-title').textContent;
    this.pvLabel.textContent = tile.pv;
    this.readout.textContent = '';
    this.white.max = tile.max;
    this.black.max = tile.max;
    this.lastFrameAt = 0;
    if (!this.dialog.open) this.dialog.showModal();
    this.onChange();
  }

  closed() {
    if (this.tile) this.tile.paused = false;
    this.tile = null;
    this.onChange();
  }

  want() {
    if (!this.tile || document.hidden) return null;
    const px = Math.max(1, Math.round(this.canvas.clientWidth * (window.devicePixelRatio || 1)));
    return { px, fps: this.tile.rate, lossless: this.lossless.checked };
  }

  receive(header, payload, look) {
    this.lastFrameAt = performance.now();
    showStatus(this.chip, look);
    const mode = header.encoding === ENCODING_LOSSLESS16 ? '16-bit' : 'JPEG';
    this.info.textContent = `${header.width}×${header.height} ${mode} · peak ${header.maxValue}`;
    if (header.width && header.height) this.renderer.draw(header, payload);
  }

  // Black and white for a 16-bit frame. `auto` mirrors the gateway's: the
  // background (a low percentile of a sample) to the brightest pixel.
  levels(values, header) {
    const mode = this.levelMode.value;
    if (mode === 'manual') return [Number(this.black.value) || 0, Number(this.white.value) || 65535];
    if (mode === 'full') return [0, this.tile.max];
    const sample = [];
    for (let i = 0; i < values.length; i += 97) sample.push(values[i]);
    sample.sort((a, b) => a - b);
    const black = sample[Math.floor(sample.length * 0.01)] || 0;
    const white = Math.max(header.maxValue, black + 16);
    this.black.value = black;
    this.white.value = white;
    return [black, white];
  }

  // The true value under the cursor — only a 16-bit frame has one.
  point(event) {
    const frame = this.renderer.values;
    if (!frame) {
      this.readout.textContent = 'switch to 16-bit for pixel values';
      return;
    }
    const box = this.canvas.getBoundingClientRect();
    const x = Math.floor(((event.clientX - box.left) / box.width) * frame.width);
    const y = Math.floor(((event.clientY - box.top) / box.height) * frame.height);
    if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) return;
    this.readout.textContent = `x ${x} y ${y}: ${frame.values[y * frame.width + x]}`;
  }
}

function socketUrl(address) {
  const url = new URL(address, window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.href;
}

class CameraSocket {
  constructor(address, tiles) {
    this.address = address;
    this.tiles = tiles;
    this.focus = null;
    this.byPv = new Map();
    for (const tile of tiles) {
      if (!this.byPv.has(tile.pv)) this.byPv.set(tile.pv, []);
      this.byPv.get(tile.pv).push(tile);
    }
    this.hello = null;
    this.socket = null;
    this.retry = 1;
    this.sent = '';
  }

  connect() {
    const socket = new WebSocket(socketUrl(this.address));
    socket.binaryType = 'arraybuffer';
    this.socket = socket;
    socket.addEventListener('message', (event) => this.onMessage(event.data));
    socket.addEventListener('open', () => {
      this.retry = 1;
    });
    socket.addEventListener('close', () => {
      this.socket = null;
      this.hello = null;
      this.sent = '';
      this.markAllStale();
      setTimeout(() => this.connect(), this.retry * 1000);
      this.retry = Math.min(this.retry * 2, RECONNECT_MAX_SECONDS);
    });
  }

  onMessage(data) {
    if (typeof data === 'string') {
      const message = JSON.parse(data);
      if (message.hello) {
        this.hello = message.hello;
        this.sendView(true);
      }
      return;
    }
    if (!this.hello || data.byteLength < HEADER_SIZE) return;
    const header = parseHeader(data);
    const pv = this.hello.cameras[header.camera];
    const look = this.hello.status[String(header.status)] || this.hello.stale;
    const payload = data.slice(HEADER_SIZE);
    for (const tile of this.byPv.get(pv) || []) tile.receive(header, payload, look);
    if (this.focus && this.focus.pv === pv) this.focus.receive(header, payload, look);
  }

  // The whole view, every time: the gateway replaces what it had, so there
  // is no subscribe/unsubscribe bookkeeping to get out of step. One entry per
  // camera, so a tile and the focus view of the same camera ask together.
  sendView(force = false) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.hello) return;
    const view = {};
    const add = (pv, want) => {
      if (!want) return;
      const current = view[pv];
      view[pv] = current
        ? {
            px: Math.max(current.px, want.px),
            fps: Math.max(current.fps, want.fps),
            lossless: Boolean(current.lossless || want.lossless),
          }
        : want;
    };
    for (const tile of this.tiles) add(tile.pv, tile.want());
    if (this.focus && this.focus.pv) add(this.focus.pv, this.focus.want());
    const message = JSON.stringify({ view });
    if (force || message !== this.sent) {
      this.socket.send(message);
      this.sent = message;
    }
  }

  stale() {
    return (this.hello && this.hello.stale) || FALLBACK_STALE;
  }

  markAllStale() {
    for (const tile of this.tiles) showStatus(tile.chip, this.stale());
    if (this.focus) showStatus(this.focus.chip, this.stale());
  }

  checkStale() {
    const now = performance.now();
    const viewers = [...this.tiles];
    if (this.focus && this.focus.pv) viewers.push(this.focus);
    for (const viewer of viewers) {
      const want = viewer.want();
      if (!want) continue;
      const limit = Math.max(STALE_SECONDS, 3 / want.fps) * 1000;
      if (now - viewer.lastFrameAt > limit) showStatus(viewer.chip, this.stale());
    }
  }
}

function start() {
  if (!meta) return;
  const tiles = Array.from(document.querySelectorAll('[data-camera]'), (el) => new Tile(el));
  if (!tiles.length) return;
  const socket = new CameraSocket(meta.content, tiles);
  const byElement = new Map(tiles.map((tile) => [tile.element, tile]));

  let pending = 0;
  const viewChanged = () => {
    // Coalesce a burst (a scroll, a resize) into one message.
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      socket.sendView();
    });
  };

  const dialog = document.querySelector('[data-camera-focus]');
  if (dialog) {
    socket.focus = new Focus(dialog, viewChanged);
    for (const tile of tiles) {
      tile.canvas.addEventListener('click', () => socket.focus.open(tile));
      tile.canvas.title = 'Click for the full-resolution view';
    }
  }

  const visibility = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) byElement.get(entry.target).visible = entry.isIntersecting;
      viewChanged();
    },
    { rootMargin: '64px' },
  );
  const size = new ResizeObserver(viewChanged);
  for (const tile of tiles) {
    visibility.observe(tile.element);
    size.observe(tile.canvas);
  }
  if (dialog) size.observe(socket.focus.canvas);
  document.addEventListener('visibilitychange', viewChanged);
  setInterval(() => socket.checkStale(), 1000);
  socket.connect();
}

start();
