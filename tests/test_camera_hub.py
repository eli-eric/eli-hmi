"""The camera hub (`cameras.hub`): what keeps a hundred cameras affordable.

Driven by a source the test pushes frames into by hand, so each promise is
checked without timing luck: a camera nobody looks at costs nothing, viewers
share encodes, and a slow viewer gets the newest frame rather than a backlog.
"""

from __future__ import annotations

import asyncio
import logging

import numpy as np
import pytest

from cameras.hub import CameraHub, Want, choose_factor
from cameras.protocol import Status
from cameras.spec import CameraSpec, Frame

CAM1 = CameraSpec(pv="Z:CAM1:Image", width=64, height=48, rate=10)
CAM2 = CameraSpec(pv="Z:CAM2:Image", width=64, height=48, rate=10)


class ManualSource:
    """A frame source the test drives: it records what the hub opened and
    delivers exactly the frames the test pushes."""

    def __init__(self):
        self.open_channels: dict[str, object] = {}
        self.opens: list[str] = []
        self.closes: list[str] = []

    async def start(self):
        pass

    async def stop(self):
        pass

    def open(self, spec, channel, on_frame):
        self.opens.append(channel)
        self.open_channels[spec.pv] = on_frame
        return spec.pv

    def close(self, handle):
        self.closes.append(handle)
        self.open_channels.pop(handle, None)

    def push(self, pv: str, seq: int, value: int = 1000) -> None:
        pixels = np.full((48, 64), value, dtype=np.uint16)
        self.open_channels[pv](Frame(pixels=pixels, seq=seq, timestamp=float(seq)))


@pytest.fixture
async def setup():
    source = ManualSource()
    hub = CameraHub({CAM1.pv: CAM1, CAM2.pv: CAM2}, source)
    await hub.start()
    yield hub, source
    await hub.stop()


async def until(check, timeout: float = 2.0) -> None:
    async with asyncio.timeout(timeout):
        while not check():
            await asyncio.sleep(0.005)


def stats(hub: CameraHub, pv: str) -> dict:
    return hub.stats()["cameras"][pv]


TILE = Want(px=32, fps=10)


class TestOnDemand:
    async def test_a_camera_nobody_watches_is_never_opened(self, setup):
        hub, source = setup
        hub.viewer()
        await asyncio.sleep(0.01)
        assert source.opens == []

    async def test_the_first_viewer_opens_it_and_the_last_one_leaving_closes_it(self, setup):
        hub, source = setup
        first, second = hub.viewer(), hub.viewer()

        first.want({CAM1.pv: TILE})
        second.want({CAM1.pv: TILE})
        assert source.opens == [CAM1.pv]

        first.close()
        assert source.closes == []
        second.close()
        assert source.closes == [CAM1.pv]

    async def test_a_new_view_replaces_the_old_one(self, setup):
        hub, source = setup
        viewer = hub.viewer()
        viewer.want({CAM1.pv: TILE})

        viewer.want({CAM2.pv: TILE})

        assert source.closes == [CAM1.pv]
        assert set(source.open_channels) == {CAM2.pv}

    async def test_a_camera_the_zone_does_not_have_is_refused(self, setup):
        """The page names cameras, never PVs to monitor: a browser must not be
        able to make the gateway subscribe to anything it likes."""
        hub, source = setup
        rejected = hub.viewer().want({"ANY:OTHER:PV": TILE, CAM1.pv: TILE})
        assert rejected == ["ANY:OTHER:PV"]
        assert source.opens == [CAM1.pv]


class TestSharing:
    async def test_viewers_at_the_same_scale_share_one_encode(self, setup):
        hub, source = setup
        viewers = [hub.viewer() for _ in range(5)]
        for viewer in viewers:
            viewer.want({CAM1.pv: TILE})

        source.push(CAM1.pv, seq=1)
        batches = [await asyncio.wait_for(viewer.next(), 2) for viewer in viewers]

        assert [batch[0].header.seq for batch in batches] == [1] * 5
        assert stats(hub, CAM1.pv)["encodes"] == 1
        # Received once, however many watch: the network cost is per camera.
        assert stats(hub, CAM1.pv)["bytes_in"] == 64 * 48 * 2

    async def test_each_scale_is_encoded_once(self, setup):
        hub, source = setup
        small, big = hub.viewer(), hub.viewer()
        small.want({CAM1.pv: Want(px=16, fps=10)})
        big.want({CAM1.pv: Want(px=64, fps=10)})

        source.push(CAM1.pv, seq=1)
        (tile,) = await asyncio.wait_for(small.next(), 2)
        (full,) = await asyncio.wait_for(big.next(), 2)

        assert (tile.header.width, full.header.width) == (16, 64)
        assert stats(hub, CAM1.pv)["encodes"] == 2


class TestLatestWins:
    async def test_a_viewer_that_is_not_reading_gets_the_newest_frame_not_a_backlog(self, setup):
        hub, source = setup
        slow = hub.viewer()
        slow.want({CAM1.pv: TILE})

        for seq in range(1, 6):
            source.push(CAM1.pv, seq=seq)
            await until(lambda seq=seq: stats(hub, CAM1.pv)["encodes"] == seq)
            await asyncio.sleep(DUE)

        (delivery,) = await asyncio.wait_for(slow.next(), 2)
        assert delivery.header.seq == 5
        assert slow.dropped == 4

    async def test_a_viewer_gets_no_more_frames_than_it_asked_for(self, setup):
        hub, source = setup
        viewer = hub.viewer()
        viewer.want({CAM1.pv: Want(px=32, fps=2)})

        for seq in range(1, 11):  # a burst, far faster than 2 a second
            source.push(CAM1.pv, seq=seq)
            await asyncio.sleep(0.005)
        await until(lambda: stats(hub, CAM1.pv)["frames_in"] == 10)
        await asyncio.sleep(0.05)

        assert stats(hub, CAM1.pv)["encodes"] == 1
        (delivery,) = await asyncio.wait_for(viewer.next(), 2)
        assert delivery.header.seq == 1


#: Long enough for a 10 fps viewer to be due its next frame.
DUE = 0.1


class TestScale:
    @pytest.mark.parametrize(
        "px, factor",
        [(1024, 1), (600, 1), (512, 2), (352, 2), (256, 4), (200, 4), (128, 8), (40, 8), (2000, 1)],
    )
    def test_a_tile_gets_the_smallest_image_at_least_as_wide_as_it_is_drawn(self, px, factor):
        spec = CameraSpec(pv="Z:BIG:Image", width=1024, height=1024)
        assert choose_factor(spec, px) == factor


class TestStatus:
    """What the gateway knows about a frame travels in its header, measured on
    the full-resolution frame: a downscaled tile averages a saturated pixel
    away, which is exactly when the operator needs to know about it."""

    async def test_a_saturated_frame_says_so(self, setup):
        hub, source = setup
        viewer = hub.viewer()
        viewer.want({CAM1.pv: Want(px=16, fps=10)})

        pixels = np.full((48, 64), 500, dtype=np.uint16)
        pixels[10, 10] = CAM1.max_value
        source.open_channels[CAM1.pv](Frame(pixels=pixels, seq=1, timestamp=1.0))
        (delivery,) = await asyncio.wait_for(viewer.next(), 2)

        assert delivery.header.status == Status.SATURATED
        assert delivery.header.max_value == CAM1.max_value
        assert delivery.header.saturated == 1  # one pixel in 3072: rounded up, never 0

    async def test_a_good_frame_says_so(self, setup):
        hub, source = setup
        viewer = hub.viewer()
        viewer.want({CAM1.pv: TILE})

        source.push(CAM1.pv, seq=1, value=1234)
        (delivery,) = await asyncio.wait_for(viewer.next(), 2)

        assert delivery.header.status == Status.OK
        assert delivery.header.max_value == 1234
        assert delivery.header.saturated == 0


FILTERED = CameraSpec(pv="Z:NEW:Image", width=64, height=48, rate=10, filters=True)


@pytest.fixture
async def filtered():
    source = ManualSource()
    hub = CameraHub({FILTERED.pv: FILTERED}, source)
    await hub.start()
    yield hub, source
    await hub.stop()


class TestChannelSwitch:
    """With `filters: true` the channel follows the fastest viewer: tiles get a
    decimated stream from the IOC, and a focus view switches to the full one."""

    async def test_tiles_get_a_decimated_channel(self, filtered):
        hub, source = filtered
        hub.viewer().want({FILTERED.pv: Want(px=32, fps=2)})
        assert source.opens == ['Z:NEW:Image.{"dec":{"n":5}}']

    async def test_a_faster_viewer_switches_channel_without_losing_anyone(self, filtered):
        hub, source = filtered
        tile, focus = hub.viewer(), hub.viewer()
        tile.want({FILTERED.pv: Want(px=32, fps=2)})

        focus.want({FILTERED.pv: Want(px=64, fps=10)})

        assert source.opens == ['Z:NEW:Image.{"dec":{"n":5}}', "Z:NEW:Image"]
        assert source.closes == [FILTERED.pv]
        source.push(FILTERED.pv, seq=1)
        assert (await asyncio.wait_for(tile.next(), 2))[0].header.seq == 1
        assert (await asyncio.wait_for(focus.next(), 2))[0].header.seq == 1

    async def test_when_the_fast_viewer_leaves_the_tiles_go_back_to_decimated(self, filtered):
        hub, source = filtered
        tile, focus = hub.viewer(), hub.viewer()
        tile.want({FILTERED.pv: Want(px=32, fps=2)})
        focus.want({FILTERED.pv: Want(px=64, fps=10)})

        focus.close()

        assert source.opens[-1] == 'Z:NEW:Image.{"dec":{"n":5}}'
        assert hub.stats()["cameras"][FILTERED.pv]["channel"] == 'Z:NEW:Image.{"dec":{"n":5}}'


class TestLostCamera:
    async def test_viewers_are_told_when_the_camera_drops(self, setup):
        hub, source = setup
        viewer = hub.viewer()
        viewer.want({CAM1.pv: TILE})

        source.open_channels[CAM1.pv](
            Frame(pixels=None, seq=1, timestamp=1.0, error="channel disconnected", disconnected=True)
        )
        (delivery,) = await asyncio.wait_for(viewer.next(), 2)

        assert delivery.header.status == Status.DISCONNECTED
        assert (delivery.header.width, delivery.header.height) == (0, 0)
        assert delivery.payload == b""

    async def test_viewers_are_told_when_the_camera_sends_garbage(self, setup):
        hub, source = setup
        viewer = hub.viewer()
        viewer.want({CAM1.pv: TILE})

        source.open_channels[CAM1.pv](Frame(pixels=None, seq=1, timestamp=1.0, error="10 elements"))
        (delivery,) = await asyncio.wait_for(viewer.next(), 2)

        assert delivery.header.status == Status.BAD_FRAME


class TestLosslessViewers:
    async def test_a_lossless_viewer_gets_exact_pixels_alongside_a_jpeg_viewer(self, setup):
        from cameras.encode import decode_lossless
        from cameras.protocol import Encoding

        hub, source = setup
        focus, tile = hub.viewer(), hub.viewer()
        focus.want({CAM1.pv: Want(px=64, fps=10, lossless=True)})
        tile.want({CAM1.pv: Want(px=64, fps=10)})

        source.push(CAM1.pv, seq=1, value=3210)
        (exact,) = await asyncio.wait_for(focus.next(), 2)
        (jpeg,) = await asyncio.wait_for(tile.next(), 2)

        assert exact.header.encoding == Encoding.LOSSLESS16
        assert (decode_lossless(exact.payload, 64, 48) == 3210).all()
        assert jpeg.header.encoding == Encoding.JPEG
        assert stats(hub, CAM1.pv)["encodes"] == 2


class TestResilience:
    async def test_a_frame_that_cannot_be_encoded_does_not_stop_the_camera(self, setup):
        """One bad frame — a wrong shape that got past the source, say — must
        cost that frame, not freeze the tile for the rest of the shift."""
        hub, source = setup
        viewer = hub.viewer()
        viewer.want({CAM1.pv: TILE})

        source.open_channels[CAM1.pv](
            Frame(pixels=np.zeros(7, dtype=np.uint16), seq=1, timestamp=1.0)
        )
        await asyncio.sleep(DUE)
        source.push(CAM1.pv, seq=2)
        (delivery,) = await asyncio.wait_for(viewer.next(), 2)

        assert delivery.header.seq == 2


# ---------------------------------------------------------------------------
# PNG-encoded waveforms
# ---------------------------------------------------------------------------

PNG_CAM = CameraSpec(pv="Z:PNG:IMG", width=64, height=48, bits=16, rate=10, encoding="png")
#: Every pixel exactly, and due a new frame almost at once.
EXACT = Want(px=64, fps=1000, lossless=True)
#: Long enough for an EXACT viewer to be due its next frame.
EXACT_DUE = 0.01


def png_bytes(pixels: np.ndarray) -> bytes:
    """A PNG file of `pixels`, the way a camera IOC that compresses would put
    it in a CHAR waveform."""
    import io

    from PIL import Image

    buffer = io.BytesIO()
    Image.fromarray(pixels).save(buffer, format="PNG")
    return buffer.getvalue()


def png_update(data: bytes, dtype=np.uint8):
    """The waveform as aioca delivers it: one element per byte."""
    from tests.test_camera_ca import update

    return update(np.frombuffer(data, dtype=np.uint8).view(dtype), dtype)


@pytest.fixture
async def png():
    source = ManualSource()
    hub = CameraHub({PNG_CAM.pv: PNG_CAM}, source)
    await hub.start()
    yield hub, source
    await hub.stop()


def send(source: ManualSource, spec: CameraSpec, data: bytes, seq: int) -> None:
    from cameras.ca import frame_from_update

    source.open_channels[spec.pv](frame_from_update(spec, png_update(data), seq))


class TestPngCameras:
    """A camera whose IOC puts a PNG file in the waveform rather than raw
    pixels (`encoding: png`). The gateway decodes it on the encode pool, only
    when a viewer is due a frame, and from there on it is a frame like any
    other."""

    async def test_a_png_waveform_reaches_the_viewer_as_the_image_it_encodes(self, png):
        from cameras.encode import decode_lossless

        hub, source = png
        viewer = hub.viewer()
        viewer.want({PNG_CAM.pv: EXACT})
        pixels = np.arange(64 * 48, dtype=np.uint16).reshape(48, 64) * 13

        send(source, PNG_CAM, png_bytes(pixels), seq=1)
        (delivery,) = await asyncio.wait_for(viewer.next(), 2)

        assert delivery.header.status == Status.OK
        assert (decode_lossless(delivery.payload, 64, 48) == pixels).all()

    async def test_a_png_of_another_size_is_a_bad_frame(self, png):
        hub, source = png
        viewer = hub.viewer()
        viewer.want({PNG_CAM.pv: EXACT})

        send(source, PNG_CAM, png_bytes(np.zeros((24, 32), dtype=np.uint16)), seq=1)
        (delivery,) = await asyncio.wait_for(viewer.next(), 2)

        assert delivery.header.status == Status.BAD_FRAME

    async def test_bytes_that_are_not_a_png_are_a_bad_frame_and_the_camera_carries_on(self, png):
        hub, source = png
        viewer = hub.viewer()
        viewer.want({PNG_CAM.pv: EXACT})

        send(source, PNG_CAM, b"\x00" * 500, seq=1)
        (bad,) = await asyncio.wait_for(viewer.next(), 2)
        await asyncio.sleep(EXACT_DUE)
        send(source, PNG_CAM, png_bytes(np.zeros((48, 64), dtype=np.uint16)), seq=2)
        (good,) = await asyncio.wait_for(viewer.next(), 2)

        assert bad.header.status == Status.BAD_FRAME
        assert (good.header.seq, good.header.status) == (2, Status.OK)

    @pytest.mark.parametrize("mode", ["L", "RGB"])
    async def test_an_8_bit_or_colour_png_arrives_as_grey(self, png, mode):
        from PIL import Image

        from cameras.encode import decode_lossless

        hub, source = png
        viewer = hub.viewer()
        viewer.want({PNG_CAM.pv: EXACT})
        grey = (np.arange(64 * 48) % 251).astype(np.uint8).reshape(48, 64)
        image = Image.fromarray(grey).convert(mode)

        send(source, PNG_CAM, png_bytes(np.asarray(image)), seq=1)
        (delivery,) = await asyncio.wait_for(viewer.next(), 2)

        assert (decode_lossless(delivery.payload, 64, 48) == grey).all()

    async def test_the_network_cost_is_the_png_not_the_pixels_it_decodes_to(self, png):
        hub, source = png
        viewer = hub.viewer()
        viewer.want({PNG_CAM.pv: EXACT})
        data = png_bytes(np.zeros((48, 64), dtype=np.uint16))

        send(source, PNG_CAM, data, seq=1)
        await asyncio.wait_for(viewer.next(), 2)

        assert stats(hub, PNG_CAM.pv)["bytes_in"] == len(data)


# ---------------------------------------------------------------------------
# Logging bad frames
# ---------------------------------------------------------------------------


def camera_records(caplog, pv: str) -> list:
    return [r for r in caplog.records if r.name.startswith("cameras") and pv in r.getMessage()]


async def bad_frames(source: ManualSource, viewer, count: int, *, first_seq: int = 1) -> None:
    """`count` frames the hub can do nothing with, each one served."""
    for seq in range(first_seq, first_seq + count):
        send(source, PNG_CAM, b"not a png", seq=seq)
        await asyncio.wait_for(viewer.next(), 2)
        await asyncio.sleep(EXACT_DUE)


class TestBadFrameLog:
    """A camera that sends unusable frames sends them at its frame rate. One
    log line each would bury everything else in the log, and in /monitor's.
    So a camera going bad is logged once, a camera staying bad is summarised
    now and then, and a camera coming back is logged once."""

    @pytest.fixture(autouse=True)
    def info(self, caplog):
        caplog.set_level(logging.INFO, logger="cameras")

    async def test_a_run_of_bad_frames_is_logged_once(self, png, caplog):
        hub, source = png
        viewer = hub.viewer()
        viewer.want({PNG_CAM.pv: EXACT})

        await bad_frames(source, viewer, 10)

        (record,) = camera_records(caplog, PNG_CAM.pv)
        assert record.levelname == "WARNING"
        assert "not a PNG" in record.getMessage()

    async def test_the_camera_coming_back_is_logged_once(self, png, caplog):
        hub, source = png
        viewer = hub.viewer()
        viewer.want({PNG_CAM.pv: EXACT})
        good = png_bytes(np.zeros((48, 64), dtype=np.uint16))

        await bad_frames(source, viewer, 5)
        for seq in (6, 7, 8):
            send(source, PNG_CAM, good, seq=seq)
            await asyncio.wait_for(viewer.next(), 2)
            await asyncio.sleep(EXACT_DUE)

        went_bad, came_back = camera_records(caplog, PNG_CAM.pv)
        assert came_back.levelname == "INFO"
        assert "after 5 bad" in came_back.getMessage()

    async def test_a_camera_that_stays_bad_is_summarised_now_and_then(self, caplog):
        source = ManualSource()
        hub = CameraHub({PNG_CAM.pv: PNG_CAM}, source, summary_every=0.2)
        await hub.start()
        try:
            viewer = hub.viewer()
            viewer.want({PNG_CAM.pv: EXACT})

            await bad_frames(source, viewer, 4)
            await asyncio.sleep(0.25)
            await bad_frames(source, viewer, 1, first_seq=5)
        finally:
            await hub.stop()

        went_bad, summary = camera_records(caplog, PNG_CAM.pv)
        assert summary.levelname == "WARNING"
        assert "4 more bad frames" in summary.getMessage()
        assert "not a PNG" in summary.getMessage()

    async def test_frames_that_fail_to_encode_log_one_traceback_not_one_each(self, setup, caplog):
        hub, source = setup
        viewer = hub.viewer()
        viewer.want({CAM1.pv: Want(px=64, fps=1000)})

        for seq in range(1, 6):
            source.open_channels[CAM1.pv](
                Frame(pixels=np.zeros(7, dtype=np.uint16), seq=seq, timestamp=1.0)
            )
            await until(lambda seq=seq: stats(hub, CAM1.pv)["frames_in"] == seq)
            await asyncio.sleep(EXACT_DUE)

        (record,) = camera_records(caplog, CAM1.pv)
        assert record.levelname == "ERROR"
        assert record.exc_info is not None

    async def test_a_camera_reopened_while_still_bad_is_logged_afresh(self, png, caplog):
        hub, source = png
        first = hub.viewer()
        first.want({PNG_CAM.pv: EXACT})
        await bad_frames(source, first, 3)
        first.close()

        second = hub.viewer()
        second.want({PNG_CAM.pv: EXACT})
        await bad_frames(source, second, 1, first_seq=4)

        messages = [r.getMessage() for r in camera_records(caplog, PNG_CAM.pv)]
        assert len(messages) == 2
        assert all(": bad frame:" in message for message in messages)
