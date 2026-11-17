"""The camera wire format (`cameras.protocol`). Language-neutral on purpose: a
gateway in another language, or `cameras.js`, must read it byte for byte."""

from __future__ import annotations

import re
from pathlib import Path

from cameras.protocol import HEADER_SIZE, FrameHeader, Status, pack_frame, unpack_frame

ROOT = Path(__file__).resolve().parent.parent


def test_a_frame_survives_the_round_trip():
    header = FrameHeader(
        camera=7, seq=123456, timestamp=1762780000.25, width=256, height=192,
        factor=4, status=Status.SATURATED, max_value=4095, saturated=3,
    )
    unpacked, payload = unpack_frame(pack_frame(header, b"\xff\xd8jpeg"))
    assert unpacked == header
    assert payload == b"\xff\xd8jpeg"


def test_the_page_reads_the_same_header_layout():
    """`cameras.js` parses the header with hand-written offsets; this pins
    them to the struct, so changing one without the other fails here rather
    than as garbage on a control-room screen."""
    script = (ROOT / "core/static/js/cameras.js").read_text()
    assert f"const HEADER_SIZE = {HEADER_SIZE};" in script
    offsets = dict(re.findall(r"(\w+): view\.get\w+\((\d+)", script))
    assert offsets == {
        "version": "0", "encoding": "1", "camera": "2", "seq": "4", "timestamp": "8",
        "width": "16", "height": "18", "factor": "20", "status": "21",
        "maxValue": "22", "saturated": "24",
    }
