"""Camera frames over Channel Access, through aioca.

One `camonitor` per open camera, opened when the camera's first viewer arrives
(`cameras.hub`). aioca keeps only the newest update when the callback falls
behind (`all_updates=False`, its default), so a busy gateway skips frames at
the CA layer too rather than queueing them.
"""

from __future__ import annotations

import asyncio
import itertools
import logging
import time
from typing import Any, Iterable, Mapping

import numpy as np

from cameras.source import FrameCallback
from cameras.spec import CameraSpec, Frame

logger = logging.getLogger(__name__)


class CameraError(ValueError):
    """A camera configuration the gateway cannot work with. A `ValueError`, so
    `core.server.main` reports it as a configuration error and stops."""


def frame_from_update(spec: CameraSpec, value: Any, seq: int) -> Frame:
    """What aioca delivered for a camera's waveform, as a frame.

    Never raises: a disconnect, a wrong length or a wrong type becomes a frame
    with an `error`, which the tile shows, rather than an exception in
    aioca's callback thread, which nobody would see.
    """
    stamp = float(getattr(value, "timestamp", 0.0) or time.time())
    if not getattr(value, "ok", True):
        return Frame(pixels=None, seq=seq, timestamp=time.time(), error=str(value), disconnected=True)
    array = np.asarray(value)
    if array.size != spec.pixels:
        return Frame(
            pixels=None,
            seq=seq,
            timestamp=stamp,
            error=f"{spec.pv} sent {array.size} elements, expected "
            f"{spec.width}x{spec.height}={spec.pixels}",
        )
    if array.dtype.kind not in "ui":
        return Frame(
            pixels=None, seq=seq, timestamp=stamp,
            error=f"{spec.pv} sent {array.dtype} values, expected integer pixels",
        )
    if array.dtype.itemsize == 2:
        # USHORT as it is; a SHORT waveform carrying 16-bit pixels has them
        # wrapped negative, and the same bits read as unsigned are right.
        pixels = array.view(np.uint16)
    else:
        pixels = np.clip(array, 0, spec.max_value).astype(np.uint16)
    return Frame(pixels=pixels.reshape(spec.height, spec.width), seq=seq, timestamp=stamp)


def array_bytes_problem(cameras: Iterable[CameraSpec], environ: Mapping[str, str]) -> str | None:
    """Why this process's CA client could not receive the biggest camera frame,
    or `None`.

    EPICS base 3.16.1 and later size their buffers as needed
    (`EPICS_CA_AUTO_ARRAY_BYTES`, default YES), which is what aioca's bundled
    base does. Only a station that switched that off is limited by
    `EPICS_CA_MAX_ARRAY_BYTES` — 16384 bytes unless set, a hundredth of one
    1024x1024 frame. That fails silently on a real network (the channel
    connects and no image ever arrives), so it is refused at start-up instead.

    The IOC has a limit of its own when it runs base older than 3.16.1; that is
    the IOC's configuration and cannot be checked from here.
    """
    if environ.get("EPICS_CA_AUTO_ARRAY_BYTES", "YES").strip().upper() != "NO":
        return None
    cameras = list(cameras)
    if not cameras:
        return None
    biggest = max(cameras, key=lambda spec: spec.nbytes)
    limit = int(environ.get("EPICS_CA_MAX_ARRAY_BYTES", "16384") or 16384)
    # A little headroom for the DBR_TIME header that travels with the array.
    needed = biggest.nbytes + 1024
    if limit >= needed:
        return None
    return (
        f"EPICS_CA_AUTO_ARRAY_BYTES=NO and EPICS_CA_MAX_ARRAY_BYTES={limit}, but camera "
        f"{biggest.pv} sends {biggest.nbytes} bytes a frame. Set EPICS_CA_MAX_ARRAY_BYTES "
        f"to at least {needed}, or unset EPICS_CA_AUTO_ARRAY_BYTES."
    )


class CaFrameSource:
    """Frames from real waveform PVs."""

    def __init__(self, *, connect_timeout: float = 5.0):
        self._connect_timeout = connect_timeout
        self._loop: asyncio.AbstractEventLoop | None = None
        self._aioca: Any = None
        self._open: set[Any] = set()

    async def start(self) -> None:
        import aioca

        self._aioca = aioca
        self._loop = asyncio.get_running_loop()

    async def stop(self) -> None:
        for subscription in list(self._open):
            self.close(subscription)

    def open(self, spec: CameraSpec, channel: str, on_frame: FrameCallback) -> Any:
        assert self._aioca is not None and self._loop is not None, "start() first"
        loop, counter = self._loop, itertools.count(1)

        def on_update(value: Any) -> None:
            frame = frame_from_update(spec, value, next(counter))
            if frame.error and not frame.disconnected:
                logger.warning("camera %s: %s", spec.pv, frame.error)
            loop.call_soon_threadsafe(on_frame, frame)

        subscription = self._aioca.camonitor(
            channel,
            on_update,
            format=self._aioca.FORMAT_TIME,
            notify_disconnect=True,
            connect_timeout=self._connect_timeout,
        )
        self._open.add(subscription)
        logger.info("camera %s: monitoring %s", spec.pv, channel)
        return subscription

    def close(self, handle: Any) -> None:
        self._open.discard(handle)
        handle.close()
