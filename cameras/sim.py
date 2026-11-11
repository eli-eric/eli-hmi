"""A camera simulator that draws a laser beam, not noise.

See `tests/test_camera_sim.py` for why that matters.
"""

from __future__ import annotations

import asyncio
import functools
import threading
import time
import zlib

import numpy as np

from cameras.source import FrameCallback
from cameras.spec import CameraSpec, Frame

#: Dark level of the sensor, as a fraction of full scale (100 DN at 12 bits).
PEDESTAL = 0.025
#: Order of the super-Gaussian a `flattop` beam is drawn as.
FLATTOP_ORDER = 10
#: How quickly pointing jitter forgets, in seconds: shot-to-shot wobble that
#: is mean-reverting, so the beam shakes around home rather than wandering off.
POINTING_MEMORY = 1.5
#: Slow drift (thermal, say) on top of the jitter: how far, and how slowly.
DRIFT_AMPLITUDE = 0.015
DRIFT_PERIOD = 90.0
#: Read noise, RMS, as a fraction of full scale (about 3 DN at 12 bits).
READ_NOISE = 0.0008
#: Shot noise: variance in DN per DN of signal.
SHOT_NOISE = 0.25
#: Hot pixels: one per this many pixels, at least `MIN_HOT_PIXELS`.
HOT_PIXEL_DENSITY = 50_000
MIN_HOT_PIXELS = 5
#: Margin of the shared noise banks; each frame reads them at a random offset.
BANK_MARGIN = 64


class BeamSimulator:
    """Successive frames of one camera.

    Two sources of randomness, kept apart on purpose:

    * the camera's **character** — where its beam sits, how big it is — comes
      from its PV name, so a camera looks the same on every run and no two
      cameras on a wall look alike;
    * its **behaviour** frame to frame comes from `seed`, so a test can replay
      a sequence exactly.

    The beam's shape is computed once, as a template; each frame only places
    it, scales it and adds noise. That is what keeps a frame cheap enough for
    a hundred simulated cameras.
    """

    def __init__(self, spec: CameraSpec, seed: int | None = 1):
        self.spec = spec
        self._rng = np.random.default_rng(seed)
        character = np.random.default_rng(zlib.crc32(spec.pv.encode()))
        short = min(spec.width, spec.height)
        self.waist = spec.sim.waist or float(character.uniform(0.04, 0.12) * short)
        #: Where the beam sits when nothing disturbs it.
        self.home = (
            spec.height / 2 + float(character.normal(0, 0.06)) * spec.height,
            spec.width / 2 + float(character.normal(0, 0.06)) * spec.width,
        )
        self._template = _beam_template(spec.sim.profile, self.waist, character)
        nominal = spec.sim.peak * spec.max_value
        #: Shot noise RMS at nominal energy, per template pixel. Not rescaled
        #: for each shot's energy: a few per cent either way is invisible.
        self._shot = np.sqrt(self._template * (nominal * SHOT_NOISE)).astype(np.float32)
        self._background = _background_bank(spec.height, spec.width, spec.bits)
        hot = max(MIN_HOT_PIXELS, spec.pixels // HOT_PIXEL_DENSITY)
        self._hot_at = character.choice(spec.pixels, size=hot, replace=False)
        self._hot_value = (character.uniform(0.2, 0.5, size=hot) * spec.max_value).astype(np.uint16)
        self._drift_phase = float(character.uniform(0, 2 * np.pi))
        self._drift = DRIFT_AMPLITUDE * short
        self._offset = np.zeros(2)
        self._t = 0.0

    def next(self) -> np.ndarray:
        """The next frame: (height, width) uint16, at most `spec.max_value`."""
        spec = self.spec
        dy, dx = self._rng.integers(0, BANK_MARGIN, size=2)
        frame = self._background[dy : dy + spec.height, dx : dx + spec.width].copy()

        place = _overlap(frame.shape, self._template.shape, self._centre())
        energy = self._energy()
        if place is not None:
            into, part = place
            normal = _normal_bank(self._template.shape)
            ny, nx = self._rng.integers(0, BANK_MARGIN, size=2)
            noise = normal[ny : ny + self._template.shape[0], nx : nx + self._template.shape[1]][part]
            beam = frame[into].astype(np.float32)
            beam += self._template[part] * (spec.sim.peak * spec.max_value * energy)
            beam += self._shot[part] * noise
            np.clip(beam, 0, spec.max_value, out=beam)
            frame[into] = beam

        flat = frame.reshape(-1)
        flat[self._hot_at] = np.maximum(flat[self._hot_at], self._hot_value)
        return frame

    def _centre(self) -> tuple[float, float]:
        """Where the beam is this frame: home, plus jitter, plus drift."""
        dt = 1.0 / self.spec.rate
        self._t += dt
        keep = np.exp(-dt / POINTING_MEMORY)
        kick = self.spec.sim.pointing * np.sqrt(1.0 - keep * keep)
        self._offset = self._offset * keep + kick * self._rng.standard_normal(2)
        phase = 2 * np.pi * self._t / DRIFT_PERIOD + self._drift_phase
        return (
            self.home[0] + self._offset[0] + self._drift * np.sin(phase),
            self.home[1] + self._offset[1] + self._drift * np.cos(phase),
        )

    def _energy(self) -> float:
        """This shot's energy relative to nominal: jitter, and now and then a
        spike big enough to saturate the sensor."""
        energy = max(0.0, 1.0 + self.spec.sim.jitter * float(self._rng.standard_normal()))
        if self._rng.random() < self.spec.sim.spikes:
            energy *= float(self._rng.uniform(1.6, 2.2))
        return energy


def _beam_template(profile: str, waist: float, character: np.random.Generator) -> np.ndarray:
    """The beam's intensity, peak 1, on a square just big enough to hold it.

    Slightly elliptical and tilted, as a real beam is: a perfectly round spot
    is what a simulator looks like.
    """
    reach = 2.0 if profile == "gaussian" else 1.4
    half = max(2, int(np.ceil(reach * waist)))
    axis = np.arange(-half, half + 1, dtype=np.float32)
    y, x = axis[:, None], axis[None, :]
    angle = float(character.uniform(0, np.pi))
    stretch = float(character.uniform(0.85, 1.15))
    u = (x * np.cos(angle) + y * np.sin(angle)) / (waist * stretch)
    v = (-x * np.sin(angle) + y * np.cos(angle)) / (waist / stretch)
    r2 = u * u + v * v
    if profile == "flattop":
        return np.exp(-2.0 * r2 ** (FLATTOP_ORDER / 2)).astype(np.float32)
    return np.exp(-2.0 * r2).astype(np.float32)


def _overlap(frame_shape, patch_shape, centre):
    """Where a patch centred at `centre` (row, column) lands on the frame, as
    `(frame slices, patch slices)`, or `None` if it misses entirely. A beam
    walking off the sensor is cut, as it is on a real camera."""
    half_y, half_x = patch_shape[0] // 2, patch_shape[1] // 2
    top, left = round(centre[0]) - half_y, round(centre[1]) - half_x
    y0, x0 = max(top, 0), max(left, 0)
    y1 = min(top + patch_shape[0], frame_shape[0])
    x1 = min(left + patch_shape[1], frame_shape[1])
    if y0 >= y1 or x0 >= x1:
        return None
    return (
        (slice(y0, y1), slice(x0, x1)),
        (slice(y0 - top, y1 - top), slice(x0 - left, x1 - left)),
    )


_banks = threading.Lock()


@functools.lru_cache(maxsize=16)
def _background_bank(height: int, width: int, bits: int) -> np.ndarray:
    """A dark frame — offset plus read noise — with a margin all round.

    Shared by every simulated camera of this size: each frame copies a window
    at a random offset, which is a memcpy instead of a million random draws.
    The same noise reappears shifted, which nobody can see.
    """
    full = (1 << bits) - 1
    rng = np.random.default_rng(0x5EED)
    noise = rng.standard_normal((height + BANK_MARGIN, width + BANK_MARGIN), dtype=np.float32)
    dark = PEDESTAL * full + READ_NOISE * full * noise
    return np.clip(np.rint(dark), 0, full).astype(np.uint16)


_normal: np.ndarray = np.zeros((0, 0), dtype=np.float32)


def _normal_bank(shape: tuple[int, int]) -> np.ndarray:
    """Standard normal draws, at least `shape` plus the margin, shared by every
    simulated camera for its shot noise. Grows to the biggest beam asked for."""
    global _normal
    need = (shape[0] + BANK_MARGIN, shape[1] + BANK_MARGIN)
    with _banks:
        if _normal.shape[0] < need[0] or _normal.shape[1] < need[1]:
            size = (max(need[0], _normal.shape[0]), max(need[1], _normal.shape[1]))
            _normal = np.random.default_rng(0xB0B).standard_normal(size, dtype=np.float32)
        return _normal


class SimFrameSource:
    """Frames from `BeamSimulator`, at each camera's own rate, as a source.

    Only a camera somebody has opened is drawn, so a wall of a hundred
    simulated cameras costs nothing until someone looks at it. Drawing runs on
    a worker thread; numpy releases the GIL, so the event loop stays free.
    """

    def __init__(self, seed: int | None = 1):
        self._seed = seed
        self._tasks: set[asyncio.Task] = set()

    async def start(self) -> None:
        pass

    async def stop(self) -> None:
        for task in list(self._tasks):
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()

    def open(self, spec: CameraSpec, channel: str, on_frame: FrameCallback) -> asyncio.Task:
        task = asyncio.create_task(self._run(spec, on_frame), name=f"sim camera {spec.pv}")
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return task

    def close(self, handle: asyncio.Task) -> None:
        handle.cancel()

    async def _run(self, spec: CameraSpec, on_frame: FrameCallback) -> None:
        simulator = BeamSimulator(spec, seed=_camera_seed(self._seed, spec.pv))
        period = 1.0 / spec.rate
        loop = asyncio.get_running_loop()
        next_at = loop.time()
        seq = 0
        while True:
            pixels = await asyncio.to_thread(simulator.next)
            seq += 1
            on_frame(Frame(pixels=pixels, seq=seq, timestamp=time.time()))
            next_at += period
            delay = next_at - loop.time()
            if delay < 0:
                # Behind (a slow machine, a debugger): skip ahead rather than
                # burst to catch up — a camera does not send a backlog either.
                next_at = loop.time()
                delay = 0
            await asyncio.sleep(delay)


def _camera_seed(seed: int | None, pv: str) -> int | None:
    """A per-camera seed, stable across runs: the same camera always shows the
    same sequence for a given SIM_SEED, and no two cameras show the same one."""
    if seed is None:
        return None
    return seed * 1_000_003 + zlib.crc32(pv.encode())
