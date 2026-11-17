"""Where frames come from: the interface the hub talks to.

Two implementations: `cameras.sim.SimFrameSource` (the built-in simulator) and
`cameras.ca.CaFrameSource` (Channel Access, through aioca). The hub opens a
camera when its first viewer arrives and closes it when its last one leaves, so
a source only ever works for cameras somebody is looking at.

`on_frame` is always called on the event loop's thread: a source that receives
on another thread (aioca does) hands frames over with `call_soon_threadsafe`.
"""

from __future__ import annotations

from typing import Any, Callable, Protocol

from cameras.spec import CameraSpec, Frame

FrameCallback = Callable[[Frame], None]


class FrameSource(Protocol):
    async def start(self) -> None: ...

    async def stop(self) -> None: ...

    def open(self, spec: CameraSpec, channel: str, on_frame: FrameCallback) -> Any:
        """Start delivering `channel` (the PV, perhaps with a channel filter)
        as frames of `spec`. Returns a handle for `close`."""
        ...

    def close(self, handle: Any) -> None: ...
