"""What a camera is, as far as the gateway is concerned.

A `CameraSpec` is the camera counterpart of `core.components.PvSpec`: a
component declares one per image it shows (`Component.cameras()`), the zone
unions them (`Zone.cameras()`), and everything downstream — the gateway, the
simulator, the local IOC — reads the same declaration. Nothing here is about how
a tile looks on the page.

A camera is identified by its image PV. Two screens showing the same camera
declare the same PV, and must agree on its geometry.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

import numpy as np

BeamProfile = Literal["gaussian", "flattop"]


@dataclass(frozen=True)
class SimBeam:
    """How the simulator draws this camera's beam. Read by nothing else."""

    #: `gaussian` is a TEM00 spot; `flattop` a super-Gaussian, the shape a
    #: high-power amplifier chain is engineered to deliver.
    profile: BeamProfile = "gaussian"
    #: Beam radius (1/e²) in pixels. `None` lets the simulator pick one from
    #: the camera's name, so every camera on a wall looks a little different.
    waist: float | None = None
    #: Peak brightness at nominal energy, as a fraction of full scale.
    peak: float = 0.7
    #: Shot-to-shot energy fluctuation, relative RMS.
    jitter: float = 0.03
    #: Pointing jitter, RMS pixels.
    pointing: float = 2.0
    #: Chance per frame of an energy spike big enough to saturate the sensor.
    spikes: float = 0.0


@dataclass(frozen=True)
class CameraSpec:
    """One camera: an EPICS waveform PV holding a mono image, row-major."""

    #: The waveform PV. Also the camera's identity everywhere.
    pv: str
    width: int
    height: int
    #: Significant bits per pixel. Pixels arrive as 16-bit words; a 12-bit
    #: sensor saturates at 4095, and that is what "saturated" means here.
    bits: int = 12
    #: Frames per second the camera delivers.
    rate: float = 10.0
    label: str = ""
    #: Fixed black and white levels for display, or `None` for automatic.
    levels: tuple[int, int] | None = None
    #: The IOC runs EPICS base >= 7.0.3, so the gateway may ask it to decimate
    #: with a server-side channel filter instead of pulling every frame.
    filters: bool = False
    sim: SimBeam = field(default_factory=SimBeam)

    @property
    def max_value(self) -> int:
        """The brightest value a pixel can report: saturation."""
        return (1 << self.bits) - 1

    @property
    def pixels(self) -> int:
        return self.width * self.height

    @property
    def nbytes(self) -> int:
        """Bytes per frame on the wire (16-bit words)."""
        return self.pixels * np.dtype(np.uint16).itemsize

    @property
    def geometry(self) -> tuple[int, int, int]:
        """What two declarations of one camera must agree on."""
        return (self.width, self.height, self.bits)


@dataclass(frozen=True, eq=False)
class Frame:
    """One image as it arrived from a source."""

    #: (height, width) uint16, row-major. Shared, never written after creation.
    pixels: np.ndarray | None
    seq: int
    #: When it was taken (the EPICS timestamp), Unix seconds.
    timestamp: float
    #: Why there is no usable image, when there is not.
    error: str | None = None
    #: The source lost the PV, as opposed to delivering something unusable.
    disconnected: bool = False

    @property
    def ok(self) -> bool:
        return self.error is None and self.pixels is not None
