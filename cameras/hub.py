"""The camera hub: one subscription per camera, one encode per (camera, scale),
any number of viewers.

What the hub promises, and why each matters for a hundred cameras:

* **A camera nobody looks at costs nothing.** The source is opened when a
  camera's first viewer arrives and closed when its last one leaves. There is
  no prewarm, unlike the PV hub: a 2 MiB image ten times a second is not a
  cache worth keeping warm.
* **Encode once, fan out.** Viewers wanting the same camera at the same scale
  share one encode. A scale is a downscale factor from a fixed ladder
  (`protocol.SCALES`), so ten browsers with slightly different tile widths
  still cost one encode.
* **The latest frame wins; nothing queues.** Each viewer has one slot per
  camera. A frame arriving before the previous one was sent replaces it and
  counts as a drop. A slow browser therefore blocks only its own sender
  (Hypercorn awaits the socket draining) and sees fewer frames, never older
  ones — and the gateway's memory does not grow with it.

Encoding runs on a thread pool: numpy and libjpeg-turbo release the GIL, so
encodes for different cameras run in parallel and the event loop stays free
to serve sockets.
"""

from __future__ import annotations

import asyncio
import functools
import logging
import os
import time
from collections import deque
from concurrent.futures import Executor, ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Mapping

from cameras.channels import channel_for
from cameras.encode import encode_lossless, encode_tile, frame_stats
from cameras.protocol import SCALES, Encoding, FrameHeader, Status
from cameras.source import FrameSource
from cameras.spec import CameraSpec, Frame

logger = logging.getLogger(__name__)

#: A viewer wanting 10 fps from a 10 fps camera must get every frame, although
#: frames never arrive exactly 100 ms apart. A frame is due once this fraction
#: of the viewer's frame interval has passed since its last one.
DUE_SLACK = 0.85
#: How many recent frames the statistics average over.
STATS_WINDOW = 50


@dataclass(frozen=True)
class Want:
    """What a page asked for one camera: the width it draws it at, in device
    pixels, and how many frames a second it wants."""

    px: int
    fps: float
    #: Every 16-bit pixel exactly (`Encoding.LOSSLESS16`) instead of a JPEG.
    lossless: bool = False


@dataclass(frozen=True)
class Delivery:
    """One frame, encoded, waiting to be sent to one viewer."""

    pv: str
    header: FrameHeader
    payload: bytes


def choose_factor(spec: CameraSpec, px: int) -> int:
    """The largest downscale whose image is still at least `px` wide."""
    for factor in sorted(SCALES, reverse=True):
        if spec.width // factor >= px:
            return factor
    return 1


class Viewer:
    """One page's socket, as the hub sees it."""

    def __init__(self, hub: "CameraHub"):
        self._hub = hub
        self.wants: dict[str, Want] = {}
        self._slots: dict[str, Delivery] = {}
        self._ready = asyncio.Event()
        #: Loop time each camera was last offered to this viewer.
        self._offered_at: dict[str, float] = {}
        #: Frames replaced in a slot before they could be sent.
        self.dropped = 0
        #: Frames handed to `next()`'s caller.
        self.delivered = 0

    def want(self, view: Mapping[str, Want]) -> list[str]:
        """Replace what this viewer is watching. Returns the cameras refused
        because the zone has no such camera."""
        return self._hub._set_view(self, view)

    async def next(self) -> list[Delivery]:
        """Wait for at least one frame, then take everything ready."""
        await self._ready.wait()
        self._ready.clear()
        ready = list(self._slots.values())
        self._slots.clear()
        self.delivered += len(ready)
        return ready

    def close(self) -> None:
        self._hub._set_view(self, {})

    # -- called by the hub ---------------------------------------------------

    def _is_due(self, pv: str, want: Want, now: float) -> bool:
        last = self._offered_at.get(pv)
        return last is None or now - last >= DUE_SLACK / want.fps

    def _offer(self, delivery: Delivery, now: float) -> bool:
        """Put a frame in this camera's slot. True if it replaced one that was
        never sent — a drop."""
        replaced = delivery.pv in self._slots
        if replaced:
            self.dropped += 1
        self._slots[delivery.pv] = delivery
        self._offered_at[delivery.pv] = now
        self._ready.set()
        return replaced

    def _forget(self, pv: str) -> None:
        self._slots.pop(pv, None)
        self._offered_at.pop(pv, None)


@dataclass(eq=False)
class _Camera:
    spec: CameraSpec
    index: int
    viewers: dict[Viewer, Want] = field(default_factory=dict)
    handle: Any = None
    #: The CA name `handle` monitors: the PV, or the PV with a channel filter.
    channel: str | None = None
    pump: asyncio.Task | None = None
    latest: Frame | None = None
    fresh: asyncio.Event = field(default_factory=asyncio.Event)
    frames_in: int = 0
    encodes: int = 0
    #: Frames and bytes handed to viewers, and frames replaced before sending.
    frames_out: int = 0
    bytes_out: int = 0
    #: Bytes received from the source: the network cost, paid once per camera.
    bytes_in: int = 0
    dropped: int = 0
    arrivals: deque = field(default_factory=lambda: deque(maxlen=STATS_WINDOW))
    encode_seconds: deque = field(default_factory=lambda: deque(maxlen=STATS_WINDOW))

    def offer(self, viewer: "Viewer", delivery: Delivery, now: float) -> None:
        if viewer._offer(delivery, now):
            self.dropped += 1
        self.frames_out += 1
        self.bytes_out += len(delivery.payload)

    def fps_in(self) -> float:
        """Frames a second arriving lately; 0 once they have stopped."""
        if len(self.arrivals) < 2 or time.monotonic() - self.arrivals[-1] > 2.0:
            return 0.0
        return (len(self.arrivals) - 1) / max(self.arrivals[-1] - self.arrivals[0], 1e-6)


class CameraHub:
    def __init__(
        self,
        cameras: Mapping[str, CameraSpec],
        source: FrameSource,
        *,
        executor: Executor | None = None,
    ):
        self._source = source
        self._cameras = {
            pv: _Camera(spec=spec, index=index) for index, (pv, spec) in enumerate(cameras.items())
        }
        self._executor = executor or ThreadPoolExecutor(
            max_workers=min(8, os.cpu_count() or 2), thread_name_prefix="camera-encode"
        )
        self._viewers: set[Viewer] = set()

    @property
    def names(self) -> list[str]:
        """Camera PVs in index order: what the hello message lists."""
        return list(self._cameras)

    async def start(self) -> None:
        await self._source.start()

    async def stop(self) -> None:
        for camera in self._cameras.values():
            self._close(camera)
        await self._source.stop()
        self._executor.shutdown(wait=False, cancel_futures=True)

    def stats(self) -> dict[str, Any]:
        """What `/monitor` shows: per camera, who is watching and what it costs."""
        return {
            "viewers": len(self._viewers),
            "encode_threads": getattr(self._executor, "_max_workers", None),
            "cameras": {
                pv: {
                    "open": camera.handle is not None,
                    "viewers": len(camera.viewers),
                    "channel": camera.channel,
                    "frames_in": camera.frames_in,
                    "bytes_in": camera.bytes_in,
                    "fps_in": round(camera.fps_in(), 2),
                    "encodes": camera.encodes,
                    "encode_ms": round(
                        1000 * sum(camera.encode_seconds) / len(camera.encode_seconds), 2
                    )
                    if camera.encode_seconds
                    else 0.0,
                    "frames_out": camera.frames_out,
                    "bytes_out": camera.bytes_out,
                    "dropped": camera.dropped,
                }
                for pv, camera in self._cameras.items()
            },
        }

    def viewer(self) -> Viewer:
        viewer = Viewer(self)
        self._viewers.add(viewer)
        return viewer

    # -- viewers -------------------------------------------------------------

    def _set_view(self, viewer: Viewer, view: Mapping[str, Want]) -> list[str]:
        rejected = sorted(pv for pv in view if pv not in self._cameras)
        wanted = {pv: want for pv, want in view.items() if pv in self._cameras}
        for pv in set(viewer.wants) - set(wanted):
            self._cameras[pv].viewers.pop(viewer, None)
            viewer._forget(pv)
        for pv, want in wanted.items():
            self._cameras[pv].viewers[viewer] = want
        for pv in set(viewer.wants) | set(wanted):
            self._retune(self._cameras[pv])
        viewer.wants = wanted
        if not wanted:
            self._viewers.discard(viewer)
        return rejected

    # -- cameras -------------------------------------------------------------

    def _retune(self, camera: _Camera) -> None:
        """Make the camera's subscription match its viewers: none without
        viewers, otherwise the cheapest channel that still serves the fastest
        one (`channels.channel_for`). A switch keeps the pump and the viewers;
        only the CA subscription underneath changes."""
        if not camera.viewers:
            self._close(camera)
            return
        channel = channel_for(camera.spec, max(want.fps for want in camera.viewers.values()))
        if channel == camera.channel:
            return
        if camera.handle is not None:
            self._source.close(camera.handle)
        camera.channel = channel
        camera.handle = self._source.open(
            camera.spec, channel, lambda frame: self._on_frame(camera, frame)
        )
        if camera.pump is None:
            camera.pump = asyncio.create_task(
                self._pump(camera), name=f"camera pump {camera.spec.pv}"
            )

    def _close(self, camera: _Camera) -> None:
        if camera.handle is not None:
            self._source.close(camera.handle)
            camera.handle = None
        camera.channel = None
        if camera.pump is not None:
            camera.pump.cancel()
            camera.pump = None
        camera.latest = None
        camera.fresh.clear()

    def _on_frame(self, camera: _Camera, frame: Frame) -> None:
        camera.latest = frame
        camera.frames_in += 1
        if frame.pixels is not None:
            camera.bytes_in += frame.pixels.nbytes
        camera.arrivals.append(time.monotonic())
        camera.fresh.set()

    async def _pump(self, camera: _Camera) -> None:
        """Encode each new frame for the viewers it is due to, one encode per
        scale. A frame that arrives while the previous one is still encoding
        simply replaces it in `latest`: the pump never falls behind.

        A frame that fails costs that frame and a log line, never the pump: a
        dead pump would freeze the tile for the rest of the shift."""
        loop = asyncio.get_running_loop()
        while True:
            await camera.fresh.wait()
            camera.fresh.clear()
            frame = camera.latest
            if frame is None:
                continue
            try:
                await self._serve(camera, frame, loop)
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001 - see the docstring
                logger.exception("camera %s: frame %d not served", camera.spec.pv, frame.seq)

    async def _serve(self, camera: _Camera, frame: Frame, loop: asyncio.AbstractEventLoop) -> None:
        spec = camera.spec
        now = loop.time()
        #: (factor, lossless) -> viewers: one encode per distinct pair.
        due: dict[tuple[int, bool], list[Viewer]] = {}
        for viewer, want in list(camera.viewers.items()):
            if viewer._is_due(spec.pv, want, now):
                due.setdefault((choose_factor(spec, want.px), want.lossless), []).append(viewer)
        if not due:
            return
        if not frame.ok:
            # No image to send, but the tile must say why it stopped.
            status = Status.DISCONNECTED if frame.disconnected else Status.BAD_FRAME
            header = FrameHeader(
                camera=camera.index, seq=frame.seq, timestamp=frame.timestamp,
                width=0, height=0, factor=0, status=status,
            )
            for viewers in due.values():
                for viewer in viewers:
                    camera.offer(viewer, Delivery(pv=spec.pv, header=header, payload=b""), now)
            return
        stats = await loop.run_in_executor(self._executor, frame_stats, frame.pixels, spec)
        for (factor, lossless), viewers in due.items():
            started = time.perf_counter()
            if lossless:
                work = functools.partial(encode_lossless, frame.pixels, factor=factor)
            else:
                work = functools.partial(encode_tile, frame.pixels, spec, factor=factor)
            tile = await loop.run_in_executor(self._executor, work)
            camera.encode_seconds.append(time.perf_counter() - started)
            camera.encodes += 1
            header = FrameHeader(
                camera=camera.index,
                seq=frame.seq,
                timestamp=frame.timestamp,
                width=tile.width,
                height=tile.height,
                factor=factor,
                status=Status.SATURATED if stats.saturated else Status.OK,
                max_value=stats.max_value,
                saturated=stats.saturated_permille(spec.pixels),
                encoding=Encoding.LOSSLESS16 if lossless else Encoding.JPEG,
            )
            delivery = Delivery(pv=spec.pv, header=header, payload=tile.data)
            for viewer in viewers:
                if viewer in camera.viewers:
                    camera.offer(viewer, delivery, now)
