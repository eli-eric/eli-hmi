"""From what a camera's waveform carried to the pixels the rest of the gateway
works on.

A camera with `encoding: png` puts the bytes of a PNG file in its waveform
rather than raw pixels. Decoding one costs milliseconds per megapixel, so the
hub runs it on its encode pool, and only for a frame a viewer is due. A frame
that arrives and is replaced before anyone wants it is never decoded.

Never raises: anything wrong with the file becomes a frame with an `error`,
which the tile shows as BAD FRAME and the hub logs.
"""

from __future__ import annotations

import dataclasses
import io

import numpy as np
from PIL import Image, UnidentifiedImageError

from cameras.spec import CameraSpec, Frame

#: PIL modes that are already one grey value per pixel, 16 bits or wider.
_WIDE_GREY = {"I", "I;16", "I;16L", "I;16B", "I;16N"}


def decode_frame(spec: CameraSpec, frame: Frame) -> Frame:
    """`frame` with `pixels` filled in from `encoded`, or with an `error`."""
    if frame.encoded is None:
        return frame
    data = frame.encoded
    try:
        pixels = _png_pixels(data)
    except UnidentifiedImageError:
        # The first bytes say what it is instead: a PNG starts 89 50 4e 47.
        return _bad(frame, f"{spec.pv} sent {len(data)} bytes that are not a PNG file, "
                    f"starting {data[:8].hex(' ') or '(empty)'}")
    except Exception as error:  # noqa: BLE001 - see the module docstring
        return _bad(frame, f"{spec.pv} sent a PNG that could not be decoded: {error}")
    height, width = pixels.shape
    if (width, height) != (spec.width, spec.height):
        return _bad(
            frame,
            f"{spec.pv} sent a {width}x{height} PNG, expected {spec.width}x{spec.height}: "
            f"set width: {width} and height: {height} on the camera",
        )
    return dataclasses.replace(frame, pixels=pixels, encoded=None)


def _png_pixels(data: bytes) -> np.ndarray:
    """A PNG file as (height, width) uint16. Colour is reduced to grey."""
    with Image.open(io.BytesIO(data), formats=["PNG"]) as image:
        image.load()
        if image.mode in _WIDE_GREY:
            return np.clip(np.asarray(image), 0, 0xFFFF).astype(np.uint16)
        if image.mode != "L":
            image = image.convert("L")
        return np.asarray(image).astype(np.uint16)


def _bad(frame: Frame, error: str) -> Frame:
    return dataclasses.replace(frame, pixels=None, encoded=None, error=error)
