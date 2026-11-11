"""Turning a raw 16-bit camera frame into what a browser draws (`cameras.encode`)."""

from __future__ import annotations

import io

import numpy as np
import pytest
from PIL import Image

from cameras.encode import encode_tile
from cameras.sim import BeamSimulator
from cameras.spec import CameraSpec

SPEC = CameraSpec(pv="SIM:CAM1:Image", width=1024, height=1024, bits=12)


def decode(jpeg: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(jpeg))
    image.load()
    return image


class TestTile:
    def test_a_frame_encodes_to_a_jpeg_of_the_requested_scale(self):
        frame = BeamSimulator(SPEC, seed=1).next()

        tile = encode_tile(frame, SPEC, factor=4)

        image = decode(tile.data)
        assert image.format == "JPEG"
        assert image.mode == "L"
        assert image.size == (256, 256) == (tile.width, tile.height)


def pixels_of(tile) -> np.ndarray:
    return np.asarray(decode(tile.data), dtype=np.float64)


def flat(value: int, size: int = 64) -> np.ndarray:
    return np.full((size, size), value, dtype=np.uint16)


class TestLevels:
    def test_fixed_levels_map_black_to_black_and_white_to_white(self):
        spec = CameraSpec(pv="X", width=64, height=64, bits=12, levels=(100, 3000))
        image = flat(100)
        image[:, 32:] = 3000
        shown = pixels_of(encode_tile(image, spec, factor=1))
        assert shown[:, :24].mean() < 8
        assert shown[:, 40:].mean() > 247

    def test_auto_levels_stretch_a_dim_beam_to_full_contrast(self):
        """A beam at a fifth of full scale should still fill the grey range."""
        spec = CameraSpec(pv="X", width=64, height=64, bits=12)  # levels: auto
        image = flat(100)
        image[28:36, 28:36] = 900
        shown = pixels_of(encode_tile(image, spec, factor=1))
        assert shown[:10, :10].mean() < 8
        assert shown[30:34, 30:34].mean() > 240

    def test_auto_levels_leave_a_dark_frame_dark(self):
        """Shutter closed: stretching a sensor's read noise to full contrast
        would paint static where there is nothing — exactly the šum the
        simulator avoids."""
        spec = CameraSpec(pv="X", width=64, height=64, bits=12)
        noise = np.random.default_rng(0).normal(100, 3, (64, 64))
        shown = pixels_of(encode_tile(noise.astype(np.uint16), spec, factor=1))
        assert shown.std() < 8
        assert shown.mean() < 40


class TestLossless:
    """The focus view's 16-bit mode: every pixel exactly as the camera sent it,
    so the page can apply its own levels and read true values under the
    cursor. Bigger than a JPEG — sensor noise does not compress — so a viewer
    asks for it explicitly."""

    def test_it_round_trips_exactly(self):
        from cameras.encode import decode_lossless, encode_lossless

        frame = BeamSimulator(CameraSpec(pv="X", width=640, height=480, bits=16), seed=1).next()
        tile = encode_lossless(frame, factor=1)
        assert (tile.width, tile.height) == (640, 480)
        assert np.array_equal(decode_lossless(tile.data, tile.width, tile.height), frame)

    def test_a_downscaled_one_is_the_block_average(self):
        from cameras.encode import decode_lossless, downscale, encode_lossless

        frame = BeamSimulator(SPEC, seed=1).next()
        tile = encode_lossless(frame, factor=2)
        assert np.array_equal(decode_lossless(tile.data, 512, 512), downscale(frame, 2))

    def test_it_is_a_zlib_stream_a_browser_can_inflate_natively(self):
        """`DecompressionStream('deflate')` reads the zlib format: no JS library."""
        import zlib

        from cameras.encode import encode_lossless

        tile = encode_lossless(flat(1234, size=8), factor=1)
        planes = zlib.decompress(tile.data)
        assert len(planes) == 8 * 8 * 2
        assert planes[:64] == bytes([1234 & 0xFF]) * 64  # low bytes first…
        assert planes[64:] == bytes([1234 >> 8]) * 64  # …then high bytes


class TestDownscale:
    @pytest.mark.parametrize("factor", [1, 2, 4, 8])
    def test_it_is_the_block_average_rounded_down(self, factor):
        from cameras.encode import downscale

        frame = np.random.default_rng(factor).integers(0, 65536, (96, 128), dtype=np.uint16)
        reference = frame.reshape(96 // factor, factor, 128 // factor, factor).astype(np.float64)
        expected = np.floor(reference.mean(axis=(1, 3))).astype(np.uint16)
        assert np.array_equal(downscale(frame, factor), expected)

    def test_a_ragged_edge_is_dropped(self):
        from cameras.encode import downscale

        assert downscale(np.zeros((101, 99), dtype=np.uint16), 4).shape == (25, 24)
