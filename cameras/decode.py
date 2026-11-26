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
import logging

import numpy as np
from PIL import Image, UnidentifiedImageError

from cameras.spec import CameraSpec, Frame

logger = logging.getLogger(__name__)

#: PIL modes that are already one grey value per pixel, 16 bits or wider.
_WIDE_GREY = {"I", "I;16", "I;16L", "I;16B", "I;16N"}


def decode_frame(spec: CameraSpec, frame: Frame) -> Frame:
    """`frame` with `pixels` filled in from `encoded`, or with an `error`."""
    if frame.encoded is None:
        return frame
    data = frame.encoded
    try:
        pixels, depth = _png_pixels(data)
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
            f"{spec.pv} sent a {width}x{height} {depth}-bit PNG, expected "
            f"{spec.width}x{spec.height}: set width: {width} and height: {height} on the camera",
        )
    return dataclasses.replace(frame, pixels=pixels, encoded=None, depth=depth)


def describe(spec: CameraSpec, frame: Frame) -> None:
    """Log what a camera's PNGs really are. The hub calls it for the first
    good frame each time the camera opens, so the station's log is where
    `bits` is read off.

    A depth that contradicts `bits` is a warning naming the fix, and the
    frame is still shown: what it costs is the saturation flag. An 8-bit PNG
    never reaches a deeper camera's full scale, and a 16-bit one passes an
    8-bit camera's at 255."""
    height, width = frame.pixels.shape
    what = f"camera {spec.pv}: sends {width}x{height} {frame.depth}-bit PNGs"
    if frame.depth == 8 and spec.bits > 8:
        logger.warning(
            "%s, but is declared bits: %d, so it can never show as saturated: "
            "set bits: 8 on the camera", what, spec.bits,
        )
    elif frame.depth == 16 and spec.bits <= 8:
        logger.warning(
            "%s, but is declared bits: %d, so every pixel from %d up counts as saturated: "
            "set bits to the sensor's depth (9 to 16) on the camera",
            what, spec.bits, spec.max_value,
        )
    else:
        logger.info("%s (bits: %d)", what, spec.bits)


def _png_pixels(data: bytes) -> tuple[np.ndarray, int]:
    """A PNG file as (height, width) uint16, and the bits per pixel it held
    (8 or 16). Colour is reduced to 8-bit grey."""
    with Image.open(io.BytesIO(data), formats=["PNG"]) as image:
        image.load()
        if image.mode in _WIDE_GREY:
            return np.clip(np.asarray(image), 0, 0xFFFF).astype(np.uint16), 16
        if image.mode != "L":
            image = image.convert("L")
        return np.asarray(image).astype(np.uint16), 8


def _bad(frame: Frame, error: str) -> Frame:
    return dataclasses.replace(frame, pixels=None, encoded=None, error=error)
