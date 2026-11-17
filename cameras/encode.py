"""From a raw camera frame to bytes a browser can draw.

Pure functions on numpy arrays. Each step runs in C (numpy, libjpeg-turbo) and
releases the GIL, which is what lets the hub run encodes on a thread pool
without stalling the event loop.

The order matters for cost: downscale first, on 16-bit data, so that levels and
JPEG work on the small image a tile actually shows.
"""

from __future__ import annotations

import io
import zlib
from dataclasses import dataclass

import numpy as np
from PIL import Image

from cameras.spec import CameraSpec

#: Good enough to judge a beam's shape by eye, a fraction of the bytes of 90+.
JPEG_QUALITY = 80
#: zlib effort for lossless frames. Level 1 is several times faster than the
#: default and within a few per cent of its size: sensor noise is what makes
#: a frame big, and no effort compresses noise.
LOSSLESS_LEVEL = 1
#: Automatic levels never stretch less than this fraction of full scale from
#: black to white, so a dark frame's read noise stays dark grey instead of
#: being amplified into static.
MIN_AUTO_SPAN = 0.05


@dataclass(frozen=True)
class Tile:
    """One encoded image, ready to send."""

    data: bytes
    width: int
    height: int


@dataclass(frozen=True)
class FrameStats:
    """What the gateway reports about a full-resolution frame."""

    #: Brightest pixel.
    max_value: int
    #: Pixels at full scale.
    saturated: int

    def saturated_permille(self, pixels: int) -> int:
        """Per mille of the frame, rounded up: one saturated pixel is not 0."""
        return -(-self.saturated * 1000 // pixels) if self.saturated else 0


def frame_stats(pixels: np.ndarray, spec: CameraSpec) -> FrameStats:
    """Measured on the raw frame, before any downscale: averaging a tile would
    hide a saturated pixel, which is exactly when an operator needs to know."""
    peak = int(pixels.max())
    saturated = int(np.count_nonzero(pixels >= spec.max_value)) if peak >= spec.max_value else 0
    return FrameStats(max_value=peak, saturated=saturated)


def downscale(pixels: np.ndarray, factor: int) -> np.ndarray:
    """Average `factor`×`factor` blocks, rounded down. A ragged edge is dropped.

    Averaging rather than picking every n-th pixel keeps a tile's noise low and
    its total brightness right; a single hot pixel cannot alias into a dot.

    Summed as strided slices — rows, then columns — into a 32-bit accumulator.
    Several times faster than `reshape(...).sum(axis=(1, 3))`, which numpy
    runs as a slow reduction over interleaved axes; on a 1-megapixel frame this
    was most of a tile's encode time (`make cambench`).
    """
    if factor == 1:
        return pixels
    height = pixels.shape[0] // factor * factor
    width = pixels.shape[1] // factor * factor
    whole = pixels[:height, :width]
    rows = whole[0::factor].astype(np.uint32)
    for offset in range(1, factor):
        rows += whole[offset::factor]
    blocks = rows[:, 0::factor].copy()
    for offset in range(1, factor):
        blocks += rows[:, offset::factor]
    blocks //= factor * factor
    return blocks.astype(np.uint16)


def apply_levels(pixels: np.ndarray, black: float, white: float) -> np.ndarray:
    """Map `black`..`white` onto 0..255, clipping outside."""
    span = max(white - black, 1.0)
    scaled = (pixels.astype(np.float32) - black) * (255.0 / span)
    return np.clip(scaled, 0, 255).astype(np.uint8)


def auto_levels(pixels: np.ndarray, spec: CameraSpec) -> tuple[float, float]:
    """Black at the background, white at the brightest pixel.

    The background is a low percentile of a sparse sample — most of a beam
    camera's frame is background, and a sample keeps this cheap at full
    resolution. White is the maximum of the image being shown, so on a
    downscaled tile an isolated hot pixel, already averaged away, does not
    dim the beam.
    """
    sample = pixels[::4, ::4] if pixels.size > 4096 else pixels
    black = float(np.percentile(sample, 1))
    white = max(float(pixels.max()), black + MIN_AUTO_SPAN * spec.max_value)
    return black, white


def to_jpeg(image: np.ndarray, quality: int = JPEG_QUALITY) -> bytes:
    buffer = io.BytesIO()
    Image.fromarray(image, mode="L").save(buffer, format="JPEG", quality=quality)
    return buffer.getvalue()


def encode_tile(pixels: np.ndarray, spec: CameraSpec, *, factor: int) -> Tile:
    """A frame, downscaled by `factor`, as an 8-bit grey JPEG."""
    small = downscale(pixels, factor)
    black, white = spec.levels or auto_levels(small, spec)
    data = to_jpeg(apply_levels(small, black, white))
    return Tile(data=data, width=small.shape[1], height=small.shape[0])


def encode_lossless(pixels: np.ndarray, *, factor: int) -> Tile:
    """A frame, downscaled by `factor`, with every 16-bit value intact.

    Byte-shuffled — all low bytes, then all high bytes — and zlib-compressed.
    The shuffle is what makes it compress: a 12-bit camera's high bytes are
    nearly constant, and kept apart from the noisy low bytes they shrink to
    almost nothing. zlib because a browser inflates it natively
    (`DecompressionStream('deflate')`); see `decode_lossless` for the reverse.
    """
    small = np.ascontiguousarray(downscale(pixels, factor), dtype="<u2")
    planes = small.view(np.uint8).reshape(-1, 2).T.tobytes()
    return Tile(
        data=zlib.compress(planes, LOSSLESS_LEVEL), width=small.shape[1], height=small.shape[0]
    )


def decode_lossless(data: bytes, width: int, height: int) -> np.ndarray:
    """The reference reader for `encode_lossless` (the page has its own)."""
    planes = np.frombuffer(zlib.decompress(data), dtype=np.uint8).reshape(2, width * height)
    return np.ascontiguousarray(planes.T).view("<u2").reshape(height, width)
