"""The camera WebSocket protocol: what the gateway and `cameras.js` say to each
other. Documented for other implementations (a Rust gateway, a test client) in
`cameras/README.md`; the struct below is the reference.

One socket per page carries every camera on it:

* server → client, text: ``{"hello": {...}}`` once, ``{"rejected": [...]}``
  when a view names a camera the zone does not have.
* client → server, text: ``{"view": {"<pv>": {"px": 704, "fps": 2}}}`` — the
  complete set of cameras the page is showing right now, each with the width
  it is drawn at in device pixels and the frame rate it wants. Each message
  replaces the previous one, so a reconnect is just "send the view again".
* server → client, binary: a fixed header, then the image.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass
from enum import IntEnum

#: Where a page opens its camera socket, on this app or on a standalone gateway.
SOCKET_PATH = "/api/cameras/ws"
#: The gateway's statistics, as JSON, for `/monitor`.
STATS_PATH = "/api/cameras/stats"

VERSION = 1

#: Downscale factors the gateway encodes at. A tile asks for a width; it gets
#: the smallest factor whose image is at least that wide. A fixed ladder keeps
#: the number of distinct encodes per camera small, so many viewers share them.
SCALES = (1, 2, 4, 8)


class Encoding(IntEnum):
    #: 8-bit grey JPEG, levels already applied.
    JPEG = 1
    #: Every 16-bit pixel exactly: little-endian words byte-shuffled (all low
    #: bytes, then all high bytes) and zlib-compressed. Asked for with
    #: `"lossless": true` in a view; the page applies its own levels.
    LOSSLESS16 = 2


class Status(IntEnum):
    """What the gateway knows about a frame. The page's tone for each comes
    from `core.render.severity.camera_tone`, sent in the hello message."""

    OK = 0
    #: At least one pixel at 2^bits-1.
    SATURATED = 1
    #: The PV delivered something that is not this camera's image.
    BAD_FRAME = 2
    #: The gateway lost the PV.
    DISCONNECTED = 3


# Little-endian, no padding. Field order is the wire order.
_HEADER = struct.Struct("<BBHIdHHBBHHH")
HEADER_SIZE = _HEADER.size


@dataclass(frozen=True)
class FrameHeader:
    #: Index into the hello message's `cameras` list.
    camera: int
    #: The source frame's sequence number; gaps are frames this viewer skipped.
    seq: int
    #: When the frame was taken (EPICS timestamp, Unix seconds).
    timestamp: float
    width: int
    height: int
    #: Downscale factor this image was made at.
    factor: int
    status: Status = Status.OK
    #: Brightest raw pixel in the full-resolution frame.
    max_value: int = 0
    #: Saturated pixels, per mille of the frame (rounded up, so 1 means "some").
    saturated: int = 0
    encoding: Encoding = Encoding.JPEG
    version: int = VERSION


def pack_frame(header: FrameHeader, payload: bytes) -> bytes:
    return (
        _HEADER.pack(
            header.version,
            header.encoding,
            header.camera,
            header.seq & 0xFFFFFFFF,
            header.timestamp,
            header.width,
            header.height,
            header.factor,
            header.status,
            min(header.max_value, 0xFFFF),
            min(header.saturated, 1000),
            0,
        )
        + payload
    )


def unpack_frame(message: bytes) -> tuple[FrameHeader, bytes]:
    (
        version,
        encoding,
        camera,
        seq,
        timestamp,
        width,
        height,
        factor,
        status,
        max_value,
        saturated,
        _reserved,
    ) = _HEADER.unpack_from(message)
    if version != VERSION:
        raise ValueError(f"camera frame version {version}, expected {VERSION}")
    header = FrameHeader(
        camera=camera,
        seq=seq,
        timestamp=timestamp,
        width=width,
        height=height,
        factor=factor,
        status=Status(status),
        max_value=max_value,
        saturated=saturated,
        encoding=Encoding(encoding),
        version=version,
    )
    return header, message[HEADER_SIZE:]
