"""Which Channel Access name to subscribe to for a camera, given what its
viewers want.

The cheapest frame is one that never crosses the network. An IOC on EPICS base
7.0.3 or later can drop frames itself, with a server-side channel filter on the
name: `PV.{"dec":{"n":5}}` delivers every fifth update. When every viewer of a
camera is a small tile asking for 2 fps of a 10 fps camera, that is a fifth of
the traffic — before the gateway has done anything at all.

Only for cameras declared `filters: true`: an older IOC does not know the
syntax and would never connect the filtered name.
"""

from __future__ import annotations

import json
import math

from cameras.spec import CameraSpec


def channel_for(spec: CameraSpec, max_fps: float) -> str:
    """The name to monitor so the fastest viewer, wanting `max_fps`, still
    gets at least that many frames a second."""
    if not spec.filters or max_fps <= 0:
        return spec.pv
    keep_every = math.floor(spec.rate / max_fps)
    if keep_every < 2:
        return spec.pv
    return spec.pv + "." + json.dumps({"dec": {"n": keep_every}}, separators=(",", ":"))
