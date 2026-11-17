"""The Channel Access side of the camera gateway (`cameras.ca`,
`cameras.channels`), without an IOC: what the gateway asks the IOC for, and
what it makes of what comes back."""

from __future__ import annotations

import numpy as np
import pytest

from cameras.ca import array_bytes_problem, frame_from_update
from cameras.channels import channel_for
from cameras.spec import CameraSpec

CAM = CameraSpec(pv="L4:CAM1:Image", width=4, height=3, bits=12, rate=10)
NEW_IOC = CameraSpec(pv="L4:CAM2:Image", width=4, height=3, bits=12, rate=10, filters=True)


class TestChannel:
    """With `filters: true` the IOC drops frames nobody needs, so they never
    cross the network; without it, the gateway receives every frame."""

    def test_without_filters_the_gateway_takes_every_frame(self):
        assert channel_for(CAM, max_fps=2) == "L4:CAM1:Image"

    def test_with_filters_small_tiles_ask_the_ioc_to_decimate(self):
        assert channel_for(NEW_IOC, max_fps=2) == 'L4:CAM2:Image.{"dec":{"n":5}}'

    def test_decimation_never_delivers_fewer_frames_than_asked_for(self):
        assert channel_for(NEW_IOC, max_fps=4) == 'L4:CAM2:Image.{"dec":{"n":2}}'  # 5 fps, not 3.3
        assert channel_for(NEW_IOC, max_fps=3) == 'L4:CAM2:Image.{"dec":{"n":3}}'

    def test_a_viewer_wanting_the_full_rate_gets_the_plain_pv(self):
        assert channel_for(NEW_IOC, max_fps=10) == "L4:CAM2:Image"
        assert channel_for(NEW_IOC, max_fps=6) == "L4:CAM2:Image"


class FakeArray(np.ndarray):
    """What aioca hands a monitor callback for a waveform with FORMAT_TIME:
    a numpy array carrying `ok`, `timestamp` and `severity`."""

    ok = True
    timestamp = 1762780000.5
    severity = 0


def update(values, dtype=np.uint16) -> FakeArray:
    return np.asarray(values, dtype=dtype).view(FakeArray)


class Disconnected(Exception):
    """What aioca delivers when the channel drops (`notify_disconnect`)."""

    ok = False


class TestFrameFromUpdate:
    def test_a_waveform_becomes_an_image_of_the_declared_shape(self):
        frame = frame_from_update(CAM, update(range(12)), seq=7)
        assert frame.ok
        assert frame.pixels.shape == (3, 4)
        assert frame.pixels[1, 0] == 4  # row-major
        assert frame.seq == 7
        assert frame.timestamp == FakeArray.timestamp

    def test_a_signed_short_waveform_is_read_as_unsigned_pixels(self):
        """A 16-bit camera on a SHORT waveform: 40000 arrives as -25536."""
        values = np.array([40000] * 12, dtype=np.uint16).view(np.int16)
        frame = frame_from_update(CAM, update(values, np.int16), seq=1)
        assert frame.pixels.dtype == np.uint16
        assert frame.pixels[0, 0] == 40000

    def test_the_wrong_number_of_elements_is_an_error_not_a_crash(self):
        frame = frame_from_update(CAM, update(range(10)), seq=1)
        assert not frame.ok
        assert "10 elements" in frame.error and "4x3" in frame.error

    def test_a_dropped_channel_is_a_disconnect(self):
        frame = frame_from_update(CAM, Disconnected("channel disconnected"), seq=1)
        assert not frame.ok
        assert frame.disconnected


BIG = CameraSpec(pv="L4:BIG:Image", width=1024, height=1024, bits=16)


class TestArrayBytes:
    """EPICS base >= 3.16.1 sizes CA buffers itself (EPICS_CA_AUTO_ARRAY_BYTES
    defaults to YES). Only a station that turned that off and set a limit
    smaller than a camera frame would silently get no images."""

    def test_the_default_needs_nothing(self):
        assert array_bytes_problem([BIG], {}) is None

    def test_a_limit_is_ignored_while_auto_sizing_is_on(self):
        assert array_bytes_problem([BIG], {"EPICS_CA_MAX_ARRAY_BYTES": "16384"}) is None

    def test_auto_sizing_off_with_a_big_enough_limit_is_fine(self):
        env = {"EPICS_CA_AUTO_ARRAY_BYTES": "NO", "EPICS_CA_MAX_ARRAY_BYTES": "3000000"}
        assert array_bytes_problem([BIG], env) is None

    @pytest.mark.parametrize("limit", ["16384", None])
    def test_auto_sizing_off_with_a_small_limit_names_the_camera_and_the_fix(self, limit):
        env = {"EPICS_CA_AUTO_ARRAY_BYTES": "NO"}
        if limit:
            env["EPICS_CA_MAX_ARRAY_BYTES"] = limit
        problem = array_bytes_problem([CAM, BIG], env)
        assert "L4:BIG:Image" in problem
        assert "EPICS_CA_MAX_ARRAY_BYTES" in problem
        assert str(BIG.nbytes) in problem


class TestStartUp:
    def test_a_station_that_could_not_receive_its_cameras_refuses_to_start(self, monkeypatch):
        """Fails loudly at start-up rather than connecting every camera and
        never showing an image."""
        from core.server import create_app
        from core.settings import Settings

        monkeypatch.setenv("EPICS_CA_AUTO_ARRAY_BYTES", "NO")
        monkeypatch.delenv("EPICS_CA_MAX_ARRAY_BYTES", raising=False)
        settings = Settings(zone_code="TESTZ", epics_backend="aioca", dev=True, log_level="WARNING")

        with pytest.raises(ValueError, match="EPICS_CA_MAX_ARRAY_BYTES"):
            create_app(settings)
